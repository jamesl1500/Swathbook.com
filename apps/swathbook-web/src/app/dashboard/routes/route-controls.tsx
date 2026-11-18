"use client";

import { useState, useTransition } from "react";
import { CircleCheck, LoaderCircle, MapPinCheck, SkipForward, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { MapsFallbackDialog } from "@/components/app/maps-problem";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/libs/forms";
import { planRoute, setStopStatus, type PlanRouteState } from "./actions";

function useAction(businessId: string, onResult?: (result: PlanRouteState) => void) {
  const [pending, startTransition] = useTransition();
  function run(action: (formData: FormData) => Promise<FormState & PlanRouteState>, fields: Record<string, string>) {
    const formData = new FormData();
    formData.set("businessId", businessId);
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
      onResult?.(result);
    });
  }
  return { pending, run };
}

export function PlanRouteButton({ businessId, memberId, date, replan }: { businessId: string; memberId: string; date: string; replan: boolean }) {
  // Google Maps didn't help: say so plainly (the reason is in the server log).
  const [fallback, setFallback] = useState(false);
  const { pending, run } = useAction(businessId, (result) => setFallback(Boolean(result.mapsFallback)));
  return (
    <>
      <Button size="sm" variant={replan ? "secondary" : "primary"} disabled={pending} onClick={() => run(planRoute, { memberId, date })}>
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
        {pending ? "Planning…" : replan ? "Re-plan route" : "Plan route"}
      </Button>
      <MapsFallbackDialog open={fallback} onClose={() => setFallback(false)} />
    </>
  );
}


export function StopControls({ businessId, stopId, status }: { businessId: string; stopId: string; status: string }) {
  const { pending, run } = useAction(businessId);
  if (status === "completed" || status === "skipped") return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {status !== "arrived" ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(setStopStatus, { stopId, status: "arrived" })}>
          <MapPinCheck className="size-4" aria-hidden="true" />
          Arrived
        </Button>
      ) : null}
      <Button size="sm" disabled={pending} onClick={() => run(setStopStatus, { stopId, status: "completed" })}>
        <CircleCheck className="size-4" aria-hidden="true" />
        Done
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(setStopStatus, { stopId, status: "skipped" })}>
        <SkipForward className="size-4" aria-hidden="true" />
        Skip
      </Button>
    </div>
  );
}

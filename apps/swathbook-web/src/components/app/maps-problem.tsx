"use client";

import { useEffect, useRef } from "react";
import { MapPinOff, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Tells the person planning a route that Google Maps didn't help and drive
 * times are straight-line estimates. Deliberately plain: the reason (billing,
 * a disabled API, a restricted key) is logged on the server, not shown here.
 */
export function MapsFallbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="maps-fallback-title"
      onClose={onClose}
      className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-[1.5rem] border border-line bg-card p-0 text-ink shadow-lift backdrop:bg-ink/60"
    >
      <div className="p-6 text-center" data-testid="maps-fallback">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-sun-soft" aria-hidden="true">
          <MapPinOff className="size-6" />
        </span>
        <h2 id="maps-fallback-title" className="mt-4 text-lg font-bold">
          Something went wrong
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Using straight-line directions for now.</p>
        <Button className="mt-6 w-full" onClick={onClose}>
          OK
        </Button>
      </div>
    </dialog>
  );
}

/** A planned route's reminder that its drive times are estimates. */
export function MapsFallbackNote() {
  return (
    <p className="mt-4 flex items-center gap-2 rounded-xl border border-sun/60 bg-sun-soft px-4 py-2.5 text-sm" data-testid="maps-fallback-note">
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      Drive times use straight-line directions. Re-plan later for road times.
    </p>
  );
}

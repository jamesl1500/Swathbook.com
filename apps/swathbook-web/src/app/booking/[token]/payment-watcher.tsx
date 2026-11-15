"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";

/** How often to look again while a payment is being confirmed. */
export const PAYMENT_POLL_MS = 2_000;
/** After this, stop and let the customer refresh themselves. */
export const PAYMENT_POLL_LIMIT_MS = 45_000;

/**
 * Refreshes the page (server data only, no reload) until the payment the
 * customer just made is confirmed by Stripe's webhook. Unmounted, or rendered
 * with `active` false, once the payment has settled.
 */
export function PaymentWatcher({ active }: { active: boolean }) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);
  // Bumped by "Check again" to start a fresh round of polling.
  const [round, setRound] = useState(0);
  // Read at tick time, so a new router object never restarts (or extends) polling.
  const refresh = useEffectEvent(() => router.refresh());

  // Stripe's return URL carries the payment's client secret; keep it out of
  // the address bar and history. Passing null (not history.state) lets
  // Next.js sync the URL, so refreshes keep the other parameters.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("payment_intent_client_secret")) return;
    url.searchParams.delete("payment_intent_client_secret");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - started >= PAYMENT_POLL_LIMIT_MS) {
        window.clearInterval(timer);
        setGaveUp(true);
        return;
      }
      refresh();
    }, PAYMENT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, round]);

  if (!active) return null;
  if (!gaveUp) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-sm" aria-live="polite">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Checking for confirmation…
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-2 text-sm" aria-live="polite">
      <p>This is taking longer than usual. We&apos;ll email you as soon as it&apos;s confirmed.</p>
      <button
        type="button"
        onClick={() => {
          setGaveUp(false);
          setRound((count) => count + 1);
          router.refresh();
        }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-current/30 px-4 font-semibold"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Check again
      </button>
    </div>
  );
}

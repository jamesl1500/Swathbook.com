"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing, CalendarClock, CalendarPlus, CircleCheck, HandCoins, TriangleAlert } from "lucide-react";
import { loadNotifications, markNotificationsRead } from "@/app/dashboard/notifications-actions";
import { describeNotification, timeAgo, type NotificationFeed, type NotificationTone } from "@/libs/notifications";
import { createClient } from "@/libs/supabase/client";
import { cn } from "@/libs/utils";

/** Fallback check when live updates aren't connected (and on returning to the tab). */
const POLL_MS = 60_000;
/** Several changes at once (e.g. a paid deposit) load once. */
const BURST_MS = 500;

const TONE_ICON: Record<NotificationTone, typeof Bell> = {
  new: CalendarPlus,
  money: HandCoins,
  change: CalendarClock,
  warning: TriangleAlert,
  done: CircleCheck,
};

const TONE_STYLE: Record<NotificationTone, string> = {
  new: "bg-brand-50 text-brand-700",
  money: "bg-brand-50 text-brand-700",
  change: "bg-paper-deep text-ink-soft",
  warning: "bg-sun-soft text-ink",
  done: "bg-paper-deep text-ink-soft",
};

/**
 * The header bell: what changed on the business's jobs, live. New changes
 * (made by anyone but you) arrive over Supabase Realtime, pop up as a toast,
 * refresh the page you're on, and optionally raise a desktop alert.
 */
export function NotificationBell({
  businessId,
  userId,
  timeZone,
  currency,
  initial,
}: {
  businessId: string;
  userId: string;
  timeZone: string;
  currency: string;
  initial: NotificationFeed;
}) {
  const router = useRouter();
  const panelId = useId();
  const [feed, setFeed] = useState(initial);
  const [open, setOpen] = useState(false);
  // Only read in the panel, which is closed on first render, so server and client can differ safely.
  const [desktop, setDesktop] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const known = useRef(new Set(initial.items.map((item) => item.id)));
  const container = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  /** Load the feed; announce anything we haven't seen before. */
  const reload = useEffectEvent(async (announce: boolean) => {
    const next = await loadNotifications(businessId);
    const fresh = next.items.filter((item) => !known.current.has(item.id));
    for (const item of next.items) known.current.add(item.id);
    setFeed(open ? { ...next, unread: 0 } : next);
    if (!announce || fresh.length === 0) return;

    // Whatever page is open (bookings, schedule, a job) shows the change too.
    router.refresh();
    const first = describeNotification(fresh[0], timeZone, currency);
    const title = fresh.length === 1 ? first.title : `${fresh.length} updates`;
    const description = fresh.length === 1 ? first.body : first.title;
    toast(title, { description, action: { label: "View", onClick: () => router.push(first.href) } });
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState === "hidden") {
      new Notification(title, { body: description, tag: `swathbook-${businessId}` });
    }
  });

  // Live: every new booking event for this business that someone else caused.
  useEffect(() => {
    let timer: number | undefined;
    const channel = supabase
      .channel(`notifications:${businessId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "booking_events", filter: `business_id=eq.${businessId}` },
        (payload) => {
          if ((payload.new as { actor_id?: string | null }).actor_id === userId) return;
          window.clearTimeout(timer);
          timer = window.setTimeout(() => void reload(true), BURST_MS);
        },
      )
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, businessId, userId]);

  // Fallback: a slow check while the tab is visible, and right away on returning to it.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible") void reload(true);
    };
    const interval = window.setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  // Close on Escape or a click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function toggle() {
    const opening = !open;
    setOpen(opening);
    // Opening catches up. Items keep their "new" dot until the next load, so you can see what was new.
    if (opening && feed.unread > 0) {
      setFeed((current) => ({ ...current, unread: 0 }));
      void markNotificationsRead(businessId);
    }
  }

  async function enableDesktop() {
    if (typeof Notification === "undefined") return;
    setDesktop(await Notification.requestPermission());
  }

  const label = feed.unread ? `Notifications, ${feed.unread} unread` : "Notifications";

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        className="relative grid size-10 cursor-pointer place-items-center rounded-full text-ink-soft hover:bg-paper-deep hover:text-ink"
      >
        {feed.unread ? <BellRing className="size-5" aria-hidden="true" /> : <Bell className="size-5" aria-hidden="true" />}
        {feed.unread ? (
          <span className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-clay px-1 text-[0.7rem] font-bold leading-5 text-white" data-testid="notification-count">
            {feed.unread > 99 ? "99+" : feed.unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[1.25rem] border border-line bg-card shadow-lift"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="font-bold">Notifications</h2>
            {desktop === "default" ? (
              <button type="button" onClick={enableDesktop} className="min-h-9 cursor-pointer rounded-full px-3 text-sm font-semibold text-brand-600 hover:bg-brand-50">
                Desktop alerts
              </button>
            ) : null}
          </div>
          {feed.items.length ? (
            <ul className="max-h-[min(28rem,70vh)] divide-y divide-line overflow-y-auto" data-testid="notification-list">
              {feed.items.map((item) => {
                const described = describeNotification(item, timeZone, currency);
                const Icon = TONE_ICON[described.tone];
                return (
                  <li key={item.id}>
                    <Link href={described.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-paper">
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONE_STYLE[described.tone])}>
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{described.title}</span>
                        <span className="block truncate text-sm text-ink-soft">{described.body}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-xs text-ink-faint">{timeAgo(item.created_at)}</span>
                        {item.unread ? <span className="size-2 rounded-full bg-clay" aria-label="New" /> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-ink-soft">You&apos;re all caught up. New bookings, payments and changes show up here.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

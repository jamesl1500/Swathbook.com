"use client";

import { Ban, CircleCheck, ExternalLink, Mail, Phone, Play, ThumbsUp, UserX, type LucideIcon } from "lucide-react";
import { ActionMenu, type MenuAction } from "@/components/app/action-menu";
import { Button } from "@/components/ui/button";
import type { Database } from "@/libs/supabase/database.types";
import { useJobStatus } from "../schedule/job-actions";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

export type RowBooking = {
  id: string;
  status: BookingStatus;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  href: string;
  /** The job's start has come (today, or earlier). */
  started: boolean;
  cancelRequested: boolean;
};

/** A plan for one row: the obvious next step, and what goes in the menu. */
type Step = { key: string; label: string; icon: LucideIcon; href?: string; status?: BookingStatus; confirm?: string; askReason?: string; danger?: boolean };

const ACTIVE: BookingStatus[] = ["pending_payment", "requested", "confirmed", "in_progress"];

/**
 * What can be done with one job from the list: the obvious next step as a
 * button ("Start job" on the day, "Mark complete" once started) and the rest
 * in a "More actions" menu. Requests and cancellation requests are answered
 * in the strip under the row instead.
 */
export function bookingRowActions(booking: RowBooking, { canManage, canWork }: { canManage: boolean; canWork: boolean }) {
  const { status, started, cancelRequested, customerName } = booking;
  let primary: Step | null = null;
  const menu: Step[] = [{ key: "open", label: "Open job", icon: ExternalLink, href: booking.href }];

  if (canWork && !cancelRequested) {
    if (status === "in_progress") primary = { key: "complete", label: "Mark complete", icon: CircleCheck, status: "completed" };
    else if (status === "confirmed" && started) primary = { key: "start", label: "Start job", icon: Play, status: "in_progress" };
  }

  if (booking.customerPhone) menu.push({ key: "call", label: `Call ${customerName}`, icon: Phone, href: `tel:${booking.customerPhone}` });
  if (booking.customerEmail) menu.push({ key: "email", label: `Email ${customerName}`, icon: Mail, href: `mailto:${booking.customerEmail}` });

  if (canWork && !cancelRequested && status === "confirmed") {
    if (!started) menu.push({ key: "start", label: "Start job", icon: Play, status: "in_progress" });
    menu.push({ key: "complete", label: "Mark complete", icon: CircleCheck, status: "completed" });
    if (started) menu.push({ key: "noshow", label: "Mark as no-show", icon: UserX, status: "no_show", confirm: `Mark ${customerName} as a no-show?` });
  }
  if (canManage && status === "pending_payment") {
    menu.push({ key: "confirm", label: "Confirm without deposit", icon: ThumbsUp, status: "confirmed", confirm: `Confirm ${customerName}'s booking without the deposit?` });
  }
  if (canManage && ACTIVE.includes(status)) {
    menu.push({
      key: "cancel",
      label: "Cancel job",
      icon: Ban,
      status: "cancelled",
      askReason: `Cancel ${customerName}'s job? Add a reason for your records (optional):`,
      danger: true,
    });
  }

  return { primary, menu };
}

export function RowActions({ businessId, booking, canManage, canWork }: { businessId: string; booking: RowBooking; canManage: boolean; canWork: boolean }) {
  const { pending, set } = useJobStatus(businessId, booking.id);
  const { primary, menu } = bookingRowActions(booking, { canManage, canWork });
  const run = (step: Step) => step.status && set(step.status, { confirm: step.confirm, askReason: step.askReason });

  const actions: MenuAction[] = menu.map((step) => ({
    key: step.key,
    label: step.label,
    icon: step.icon,
    href: step.href,
    danger: step.danger,
    onSelect: step.href ? undefined : () => run(step),
  }));

  return (
    <div className="flex items-center gap-1.5">
      {primary ? (
        <Button size="sm" className="min-h-11" disabled={pending} onClick={() => run(primary)}>
          <primary.icon className="size-4" aria-hidden="true" />
          {primary.label}
          <span className="sr-only"> for {booking.customerName}</span>
        </Button>
      ) : null}
      <ActionMenu label={`More actions for ${booking.customerName}`} actions={actions} disabled={pending} />
    </div>
  );
}

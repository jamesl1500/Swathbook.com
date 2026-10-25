"use client";

import { useActionState } from "react";
import { UsersRound } from "lucide-react";
import { FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import { joinInvitedBusiness } from "./invite-actions";

export type PendingInvite = { invitation_id: string; business_name: string; role: "owner" | "admin" | "crew"; invited_by_name: string | null };

function JoinForm({ invite }: { invite: PendingInvite }) {
  const [state, formAction] = useActionState<FormState, FormData>(joinInvitedBusiness, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="invitationId" value={invite.invitation_id} />
      <SubmitButton className="min-h-11 w-full sm:w-auto" pendingLabel="Joining…">
        Join {invite.business_name}
      </SubmitButton>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
    </form>
  );
}

/**
 * Shown above setup when someone has been invited to a team: most invitees
 * want to join, not start their own business.
 */
export function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  return (
    <section aria-labelledby="invites-heading" className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <div className="rounded-[1.75rem] border border-brand-200 bg-brand-50 p-6">
        <h2 id="invites-heading" className="flex items-center gap-2 text-xl font-bold">
          <UsersRound className="size-5 text-brand-600" aria-hidden="true" />
          You&apos;ve been invited
        </h2>
        <ul className="mt-4 space-y-4">
          {invites.map((invite) => (
            <li key={invite.invitation_id} className="flex flex-col gap-3 rounded-2xl bg-card p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="pending-invitation">
              <p>
                <strong>{invite.invited_by_name ?? "Someone"}</strong> invited you to <strong>{invite.business_name}</strong> as{" "}
                {invite.role === "admin" ? "an admin" : "part of the crew"}.
              </p>
              <JoinForm invite={invite} />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-soft">Running your own business too? Set it up below.</p>
      </div>
    </section>
  );
}

"use client";

import { useActionState, useTransition } from "react";
import { RefreshCw, Send, UserMinus, X } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/app/copy-button";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import { changeRole, inviteMember, removeMember, resendInvite, revokeInvite, type InviteState } from "./actions";

export function InviteForm({ businessId, canInviteAdmins, full }: { businessId: string; canInviteAdmins: boolean; full: boolean }) {
  const [state, formAction] = useActionState<InviteState, FormData>(inviteMember, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="businessId" value={businessId} />
      {state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null}
      {state.success ? (
        <div className="space-y-2">
          <FormMessage tone="success">{state.success}</FormMessage>
          {state.inviteUrl ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-paper p-3">
              <span className="min-w-0 flex-1 break-all font-mono text-xs" data-testid="invite-url">
                {state.inviteUrl}
              </span>
              <CopyButton value={state.inviteUrl} label="Copy link" />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field label="Email" htmlFor="invite-email" error={errors.email?.[0]}>
          <Input id="invite-email" name="email" type="email" autoComplete="off" placeholder="crew@example.com" required disabled={full} />
        </Field>
        <Field label="Role" htmlFor="invite-role" error={errors.role?.[0]}>
          <Select id="invite-role" name="role" defaultValue="crew" disabled={full}>
            <option value="crew">Crew</option>
            {canInviteAdmins ? <option value="admin">Admin</option> : null}
          </Select>
        </Field>
      </div>
      <SubmitButton className="min-h-11" pendingLabel="Sending…" disabled={full}>
        <Send className="size-4" aria-hidden="true" />
        Send invite
      </SubmitButton>
    </form>
  );
}

function useRun(businessId: string) {
  const [pending, startTransition] = useTransition();
  function run(action: (formData: FormData) => Promise<FormState>, fields: Record<string, string>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    const formData = new FormData();
    formData.set("businessId", businessId);
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    startTransition(async () => {
      const result = await action(formData);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.success);
    });
  }
  return { pending, run };
}

export function MemberControls({
  businessId,
  memberId,
  name,
  role,
  canChangeRole,
  canRemove,
}: {
  businessId: string;
  memberId: string;
  name: string;
  role: "admin" | "crew";
  canChangeRole: boolean;
  canRemove: boolean;
}) {
  const { pending, run } = useRun(businessId);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canChangeRole ? (
        <>
          <label htmlFor={`role-${memberId}`} className="sr-only">
            Role for {name}
          </label>
          <Select
            id={`role-${memberId}`}
            defaultValue={role}
            disabled={pending}
            onChange={(event) => run(changeRole, { memberId, role: event.target.value })}
            className="w-auto py-2"
          >
            <option value="crew">Crew</option>
            <option value="admin">Admin</option>
          </Select>
        </>
      ) : null}
      {canRemove ? (
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 text-clay hover:text-clay"
          disabled={pending}
          onClick={() => run(removeMember, { memberId }, `Remove ${name} from the team? Their upcoming jobs become unassigned.`)}
        >
          <UserMinus className="size-4" aria-hidden="true" />
          Remove<span className="sr-only"> {name}</span>
        </Button>
      ) : null}
    </div>
  );
}

export function InviteControls({ businessId, inviteId, email }: { businessId: string; inviteId: string; email: string }) {
  const { pending, run } = useRun(businessId);
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" className="min-h-11" disabled={pending} onClick={() => run(resendInvite, { inviteId })}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Resend<span className="sr-only"> invite to {email}</span>
      </Button>
      <Button size="sm" variant="ghost" className="min-h-11" disabled={pending} onClick={() => run(revokeInvite, { inviteId }, `Cancel the invite to ${email}?`)}>
        <X className="size-4" aria-hidden="true" />
        Cancel<span className="sr-only"> invite to {email}</span>
      </Button>
    </div>
  );
}

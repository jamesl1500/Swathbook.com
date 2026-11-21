"use client";

import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { Field, FormMessage, Input, Select, inputStyles } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import { CHECK_SIZES, INVESTOR_TYPES, MESSAGE_MAX } from "@/libs/investors";
import { cn } from "@/libs/utils";
import { registerInvestorInterest } from "./actions";

export function InvestorForm() {
  const [state, formAction] = useActionState<FormState, FormData>(registerInvestorInterest, {});
  const errors = state.fieldErrors ?? {};
  const describedBy = (name: string) => (errors[name]?.[0] ? `investor-${name}-error` : undefined);

  if (state.success) {
    return (
      <div className="rounded-[1.5rem] border border-brand-200 bg-brand-50 p-6 sm:p-8" role="status" data-testid="investor-thanks">
        <CircleCheck className="size-8 text-brand-600" aria-hidden="true" />
        <p className="mt-4 text-xl font-bold">You&apos;re on the list.</p>
        <p className="mt-2 text-ink-soft">{state.success}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate data-testid="investor-form">
      {state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null}

      {/* A trap for bots: hidden from people and assistive tech. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="investor-fullName" error={errors.fullName?.[0]}>
          <Input id="investor-fullName" name="fullName" autoComplete="name" required aria-describedby={describedBy("fullName")} />
        </Field>
        <Field label="Email" htmlFor="investor-email" error={errors.email?.[0]}>
          <Input id="investor-email" name="email" type="email" autoComplete="email" required aria-describedby={describedBy("email")} />
        </Field>
      </div>

      <Field label={<>Firm or fund <span className="font-normal text-ink-faint">(optional)</span></>} htmlFor="investor-firm" error={errors.firm?.[0]}>
        <Input id="investor-firm" name="firm" autoComplete="organization" aria-describedby={describedBy("firm")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="You invest as" htmlFor="investor-investorType" error={errors.investorType?.[0]}>
          <Select id="investor-investorType" name="investorType" defaultValue="" required aria-describedby={describedBy("investorType")}>
            <option value="" disabled>
              Pick one
            </option>
            {INVESTOR_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Typical check" htmlFor="investor-checkSize">
          <Select id="investor-checkSize" name="checkSize" defaultValue="not_sure">
            {CHECK_SIZES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label={<>Anything you&apos;d like us to know <span className="font-normal text-ink-faint">(optional)</span></>}
        htmlFor="investor-message"
        error={errors.message?.[0]}
      >
        <textarea
          id="investor-message"
          name="message"
          rows={4}
          maxLength={MESSAGE_MAX}
          placeholder="What you look for, how you like to help, questions for us."
          aria-describedby={describedBy("message")}
          className={cn(inputStyles, "resize-y")}
        />
      </Field>

      <label className="flex min-h-11 items-start gap-2.5 rounded-xl border border-line px-3 py-2.5 text-sm has-checked:border-brand-500 has-checked:bg-brand-50">
        <input type="checkbox" name="accredited" className="mt-0.5 size-4 accent-[var(--color-brand-600)]" />
        <span>I&apos;m an accredited investor (or investing through an entity that is).</span>
      </label>

      <SubmitButton className="w-full sm:w-auto" pendingLabel="Sending…">
        Register interest
      </SubmitButton>
      <p className="text-xs text-ink-faint">We&apos;ll only use your details to talk with you about investing in Swathbook.</p>
    </form>
  );
}

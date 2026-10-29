import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MailCheck } from "lucide-react";
import { routes } from "@/libs/routes";
import { AuthHeading } from "../_components/auth-heading";
import { ErrorParamNotice, ParamText } from "../_components/search-params";
import { ResendVerificationForm } from "./resend-verification-form";

export const metadata: Metadata = { title: "Confirm your email" };

const tips = [
  "The email comes from Swathbook. Check spam or promotions if you don't see it.",
  "The link works once and expires after 24 hours.",
  "Open it on any device; you'll land right in setup.",
];

export default function VerifyEmailPage() {
  return (
    <>
      <AuthHeading
        icon={<MailCheck className="size-6" aria-hidden="true" />}
        title="Check your inbox"
        description={
          <>
            We sent a confirmation link to{" "}
            <strong className="text-ink">
              <Suspense fallback="your email">
                <ParamText name="email" fallback="your email" />
              </Suspense>
            </strong>
            . Click it to finish creating your account.
          </>
        }
      />

      <Suspense>
        <ErrorParamNotice
          messages={{
            link_expired: "That confirmation link expired or was already used. Send yourself a new one below.",
          }}
        />
      </Suspense>

      <ul className="space-y-3 rounded-2xl border border-line bg-card p-5 text-sm text-ink-soft">
        {tips.map((tip, index) => (
          <li key={tip} className="flex gap-3">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
              {index + 1}
            </span>
            {tip}
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <Suspense>
          <ResendVerificationForm />
        </Suspense>
      </div>

      <p className="mt-8 text-center text-sm text-ink-soft">
        Already confirmed?{" "}
        <Link href={routes.login} className="font-semibold text-brand-600 hover:text-brand-700">
          Log in
        </Link>
      </p>
    </>
  );
}

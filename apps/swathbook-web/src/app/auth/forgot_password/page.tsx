import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { routes } from "@/libs/routes";
import { AuthHeading } from "../_components/auth-heading";
import { ErrorParamNotice } from "../_components/search-params";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        icon={<KeyRound className="size-6" aria-hidden="true" />}
        title="Forgot your password?"
        description="No problem. Enter the email you signed up with and we'll send you a link to pick a new one."
      />
      <Suspense>
        <ErrorParamNotice
          messages={{ link_expired: "That reset link expired or was already used. Request a fresh one below." }}
        />
      </Suspense>
      <ForgotPasswordForm />
      <Link
        href={routes.login}
        className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to log in
      </Link>
    </>
  );
}

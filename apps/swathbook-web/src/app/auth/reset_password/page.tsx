import type { Metadata } from "next";
import { LockKeyhole } from "lucide-react";
import { AuthHeading } from "../_components/auth-heading";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Reached from the password-reset email via /auth/confirm, which signs the user
 * in with a short-lived recovery session before redirecting here.
 */
export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeading
        icon={<LockKeyhole className="size-6" aria-hidden="true" />}
        title="Choose a new password"
        description="Pick something you haven't used before. You'll be signed in right after."
      />
      <ResetPasswordForm />
    </>
  );
}

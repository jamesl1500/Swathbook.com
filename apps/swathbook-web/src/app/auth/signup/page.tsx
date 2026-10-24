import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/libs/routes";
import { AuthHeading } from "../_components/auth-heading";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Claim your free Swathbook booking link and set up services, deposits and hours in about five minutes.",
};

export default function SignupPage() {
  return (
    <>
      <AuthHeading
        title="Claim your booking link"
        description="Free to start. You'll set up your services and hours right after this."
      />
      <SignupForm />
      <p className="mt-8 text-center text-sm text-ink-soft">
        Already have an account?{" "}
        <Link href={routes.login} className="font-semibold text-brand-600 hover:text-brand-700">
          Log in
        </Link>
      </p>
    </>
  );
}

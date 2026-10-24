import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { routes } from "@/libs/routes";
import { AuthHeading } from "../_components/auth-heading";
import { ErrorParamNotice } from "../_components/search-params";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to Swathbook to see today's bookings, payments and route.",
};

export default function LoginPage() {
  return (
    <>
      <AuthHeading title="Welcome back" description="Log in to see today's bookings and route." />
      <Suspense>
        <ErrorParamNotice
          param="notice"
          tone="success"
          messages={{ account_deleted: "Your account has been deleted. Thanks for giving Swathbook a try." }}
        />
      </Suspense>
      <LoginForm />
      <p className="mt-8 text-center text-sm text-ink-soft">
        New to Swathbook?{" "}
        <Link href={routes.signup} className="font-semibold text-brand-600 hover:text-brand-700">
          Create your free account
        </Link>
      </p>
    </>
  );
}

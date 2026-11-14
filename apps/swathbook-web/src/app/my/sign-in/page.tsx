import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarCheck, Mail, RefreshCcw } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ErrorParamNotice } from "@/app/auth/_components/search-params";
import { routes } from "@/libs/routes";
import { CustomerSignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "Sign in to see your bookings",
  description: "Sign in with the email you book with to see, reschedule or cancel your Swathbook bookings.",
};

const perks = [
  { icon: CalendarCheck, text: "Every booking you've made with your email, at every business" },
  { icon: RefreshCcw, text: "Reschedule or cancel without a phone call" },
  { icon: Mail, text: "No password: we email you a code" },
];

export default function CustomerSignInPage() {
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-paper lg:grid-cols-[1fr_minmax(0,0.8fr)]">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo />
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-md">
            <Suspense>
              <ErrorParamNotice
                param="notice"
                tone="success"
                messages={{
                  signed_out: "You're signed out.",
                  account_deleted: "Your account has been deleted. Your bookings with each business are unchanged.",
                }}
              />
            </Suspense>
            <Suspense>
              <CustomerSignInForm />
            </Suspense>
            <p className="mt-10 border-t border-line pt-6 text-center text-sm text-ink-soft">
              Run a business on Swathbook?{" "}
              <Link href={routes.login} className="font-semibold text-brand-600 hover:text-brand-700">
                Business log in
              </Link>
            </p>
          </div>
        </main>
        <p className="text-center text-xs text-ink-faint">
          By continuing you agree to our{" "}
          <Link href={routes.terms} className="underline underline-offset-2 hover:text-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href={routes.privacy} className="underline underline-offset-2 hover:text-ink">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <aside className="map-grid relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-end lg:p-14">
        <div className="relative max-w-md text-paper">
          <p className="label-tag text-sky">Your bookings</p>
          <p className="mt-4 font-display text-4xl font-bold leading-tight">All your visits, in one place.</p>
          <ul className="mt-8 space-y-4">
            {perks.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-paper/90">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-paper/10">
                  <Icon className="size-4 text-sky" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonStyles } from "@/components/ui/button";
import { routes } from "@/libs/routes";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col px-4 py-6 sm:px-10">
      <Logo />
      <main className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <p className="label-tag text-brand-600">404</p>
        <h1 className="mt-3 text-4xl font-extrabold sm:text-5xl">This page took a wrong turn.</h1>
        <p className="mt-4 max-w-md text-lg text-ink-soft">
          The link may be old or mistyped. Here are a few good places to pick the route back up.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={routes.home} className={buttonStyles()}>
            Back to home
          </Link>
          <Link href={routes.features} className={buttonStyles({ variant: "secondary" })}>
            See features
          </Link>
          <Link href={routes.pricing} className={buttonStyles({ variant: "secondary" })}>
            Pricing
          </Link>
        </div>
      </main>
    </div>
  );
}

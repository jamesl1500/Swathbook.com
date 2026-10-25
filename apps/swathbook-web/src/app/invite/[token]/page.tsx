import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { UsersRound } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { Logo } from "@/components/brand/logo";
import { buttonStyles } from "@/components/ui/button";
import { getCurrentUser } from "@/libs/auth";
import { routes } from "@/libs/routes";
import { noIndex } from "@/libs/seo";
import { createClient } from "@/libs/supabase/server";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = { title: "Join your team", robots: noIndex };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper px-4 py-6 sm:px-10">
      <Logo />
      <main className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-md rounded-[1.75rem] border border-line bg-card p-6 shadow-card sm:p-8">
          <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-paper-deep" />}>
            <Invite params={params} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-600 text-paper">
        <UsersRound className="size-6" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold">{title}</h1>
      <div className="mt-3 space-y-5 text-ink-soft">{children}</div>
    </>
  );
}

async function Invite({ params }: { params: PageProps<"/invite/[token]">["params"] }) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data: preview }, user] = await Promise.all([
    supabase.rpc("invitation_preview", { p_token: token }).maybeSingle(),
    getCurrentUser(),
  ]);

  if (!preview) {
    return (
      <Shell title="This invite link isn't valid">
        <p>Check that you opened the whole link from the email, or ask whoever invited you to send a new one.</p>
        <Link href={routes.home} className={buttonStyles({ variant: "secondary" })}>
          Go to Swathbook
        </Link>
      </Shell>
    );
  }
  if (preview.expired) {
    return (
      <Shell title="This invite has expired">
        <p>Invites work once and last 7 days. Ask {preview.business_name} to send you a new one.</p>
      </Shell>
    );
  }

  const title = `Join ${preview.business_name}`;
  const role = preview.role === "admin" ? "an admin" : "part of the crew";
  const here = `/invite/${token}`;

  if (!user) {
    return (
      <Shell title={title}>
        <p>
          You&apos;ve been invited to {preview.business_name} as {role}. Create a free account with <strong className="text-ink">{preview.email}</strong>,
          or log in if you already have one.
        </p>
        <div className="space-y-2">
          <Link
            href={`${routes.signup}?email=${encodeURIComponent(preview.email)}&next=${encodeURIComponent(here)}`}
            className={buttonStyles({ size: "lg", className: "w-full" })}
          >
            Create your account
          </Link>
          <Link href={`${routes.login}?next=${encodeURIComponent(here)}`} className={buttonStyles({ variant: "secondary", size: "lg", className: "w-full" })}>
            I already have an account
          </Link>
        </div>
      </Shell>
    );
  }

  if (user.email.toLowerCase() !== preview.email.toLowerCase()) {
    return (
      <Shell title={title}>
        <p>
          This invite is for <strong className="text-ink">{preview.email}</strong>, but you&apos;re logged in as{" "}
          <strong className="text-ink">{user.email}</strong>. Log out, then open the link again and use the invited email.
        </p>
        <form action={signOut}>
          <button type="submit" className={buttonStyles({ variant: "secondary", size: "lg", className: "w-full" })}>
            Log out
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell title={title}>
      <p>You&apos;ve been invited as {role}. You&apos;ll see your jobs and today&apos;s route as soon as you join.</p>
      <AcceptInviteForm token={token} businessName={preview.business_name} />
    </Shell>
  );
}

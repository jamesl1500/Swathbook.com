import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorParamNotice } from "@/app/auth/_components/search-params";
import { Card, CardTitle, PageHeader } from "@/components/app/ui";
import { listMyBusinesses, requireUser } from "@/libs/auth";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { DeleteAccountForm, EmailForm, NameForm, PasswordForm } from "./account-forms";

export const metadata: Metadata = { title: "Account settings" };

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Account settings" description="Your personal login. Business details live under Booking link." />
      <Suspense>
        <ErrorParamNotice messages={{ link_expired: "That email confirmation link has expired or was already used. Request the change again." }} />
      </Suspense>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const user = await requireUser(routes.account);
  const supabase = await createClient();
  // getUser() (not the JWT) so a pending email change shows right away.
  const [{ data: authUser }, { data: profile }, businesses] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    listMyBusinesses(user.id),
  ]);

  const owned = businesses.filter((business) => business.role === "owner").map((business) => business.name);
  const memberOf = businesses.filter((business) => business.role !== "owner").map((business) => business.name);

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardTitle>Your name</CardTitle>
        <NameForm fullName={profile?.full_name || user.fullName} />
      </Card>

      <Card>
        <CardTitle>Email</CardTitle>
        <EmailForm email={authUser.user?.email ?? user.email} pendingEmail={authUser.user?.new_email ?? null} />
      </Card>

      <Card>
        <CardTitle>Password</CardTitle>
        <PasswordForm email={user.email} />
      </Card>

      <Card className="border-clay/40">
        <CardTitle>Delete account</CardTitle>
        <DeleteAccountForm email={user.email} owned={owned} memberOf={memberOf} />
      </Card>
    </div>
  );
}

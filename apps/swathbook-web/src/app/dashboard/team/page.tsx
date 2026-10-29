import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardTitle, ManagersOnly, PageHeader } from "@/components/app/ui";
import { requireBusinessContext } from "@/libs/dashboard";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { formatDateShort, toDateKey } from "@/libs/time";
import { cn } from "@/libs/utils";
import { InviteControls, InviteForm, MemberControls } from "./team-forms";

export const metadata: Metadata = { title: "Team" };

const ROLE_LABEL = { owner: "Owner", admin: "Admin", crew: "Crew" } as const;
const ROLE_HELP = [
  { role: "Crew", body: "Sees their jobs, today's route and customer details. Can start and finish jobs assigned to them." },
  { role: "Admin", body: "Everything crew can do, plus the full schedule, customers, services and the booking page." },
  { role: "Owner", body: "Everything, plus billing, payouts and the team." },
];

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Team" description="Invite your crew so they can see their jobs and routes on their phones." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
        <Team />
      </Suspense>
    </>
  );
}

async function Team() {
  const { business, canManage, role, user } = await requireBusinessContext(routes.team);
  if (!canManage) return <ManagersOnly what="the team" />;

  const supabase = await createClient();
  const [{ data: members }, { data: invites }, { data: seats }] = await Promise.all([
    supabase.rpc("team_members", { p_business_id: business.id }),
    supabase
      .from("business_invitations")
      .select("id, email, role, expires_at, created_at")
      .eq("business_id", business.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at"),
    supabase.rpc("team_seats", { p_business_id: business.id }).maybeSingle(),
  ]);
  const isOwner = role === "owner";
  const used = seats?.used ?? members?.length ?? 1;
  const limit = seats?.seat_limit ?? null;
  const full = limit !== null && used >= limit;
  const tz = business.timezone;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardTitle
            action={
              <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", full ? "bg-sun-soft text-ink" : "bg-paper-deep text-ink-soft")} data-testid="seat-count">
                {limit === null ? `${used} people` : `${used} of ${limit} seats`}
              </span>
            }
          >
            People
          </CardTitle>
          <ul className="divide-y divide-line">
            {(members ?? []).map((member) => {
              const isSelf = member.user_id === user.id;
              const editable = member.role !== "owner" && !isSelf;
              return (
                <li key={member.member_id} className="flex flex-wrap items-center gap-3 py-3" data-testid="team-member">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-full font-bold text-paper"
                    style={{ backgroundColor: member.calendar_color ?? "#1c3d70" }}
                    aria-hidden="true"
                  >
                    {(member.full_name ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {member.full_name}
                      {isSelf ? <span className="font-normal text-ink-soft"> (you)</span> : null}
                    </span>
                    <span className="block truncate text-sm text-ink-soft">{member.email}</span>
                  </span>
                  {editable && (isOwner || member.role === "crew") ? (
                    <MemberControls
                      businessId={business.id}
                      memberId={member.member_id}
                      name={member.full_name ?? member.email ?? "this person"}
                      role={member.role === "admin" ? "admin" : "crew"}
                      canChangeRole={isOwner}
                      canRemove
                    />
                  ) : (
                    <span className="rounded-full bg-paper-deep px-3 py-1 text-sm font-semibold text-ink-soft">{ROLE_LABEL[member.role]}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {invites?.length ? (
          <Card>
            <CardTitle>Waiting to join</CardTitle>
            <ul className="divide-y divide-line">
              {invites.map((invite) => (
                <li key={invite.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center" data-testid="pending-invite">
                  <span className="min-w-0 flex-1">
                    <span className="block break-all font-semibold">{invite.email}</span>
                    <span className="block text-sm text-ink-soft">
                      {ROLE_LABEL[invite.role]} · invite expires {formatDateShort(toDateKey(new Date(invite.expires_at), tz))}
                    </span>
                  </span>
                  <InviteControls businessId={business.id} inviteId={invite.id} email={invite.email} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="min-w-0 space-y-6">
        <Card>
          <CardTitle>Invite someone</CardTitle>
          {full ? (
            <p className="mb-4 rounded-xl bg-sun-soft px-4 py-3 text-sm">
              Your plan&apos;s seats are full.{" "}
              {isOwner ? (
                <Link href={routes.billing} className="font-semibold underline underline-offset-4">
                  Upgrade your plan
                </Link>
              ) : (
                "Ask the owner to upgrade"
              )}{" "}
              or remove someone to invite more.
            </p>
          ) : null}
          <InviteForm businessId={business.id} canInviteAdmins={isOwner} full={full} />
          <p className="mt-4 text-sm text-ink-soft">They&apos;ll get an email with a link. It works once and expires in 7 days.</p>
        </Card>

        <Card>
          <CardTitle>Who can do what</CardTitle>
          <dl className="space-y-3 text-sm">
            {ROLE_HELP.map((item) => (
              <div key={item.role}>
                <dt className="font-semibold">{item.role}</dt>
                <dd className="text-ink-soft">{item.body}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BadgeCheck, Mail } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Card } from "@/components/app/ui";
import { INVESTOR_STATUSES, INVESTOR_STATUS_LABELS, checkSizeLabel, investorTypeLabel, type InvestorStatus } from "@/libs/investors";
import { routes } from "@/libs/routes";
import { noIndex } from "@/libs/seo";
import { createAdminClient } from "@/libs/supabase/admin";
import { formatDateTime } from "@/libs/time";
import { cn } from "@/libs/utils";
import { requireStaff } from "../feedback/staff";
import { FollowUpForm } from "./follow-up-form";

export const metadata: Metadata = { title: "Investor interest", robots: noIndex };

const OPEN: InvestorStatus[] = ["new", "contacted", "meeting"];

export default function InvestorInboxPage({ searchParams }: PageProps<"/admin/investors">) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo href={routes.home} />
          <p className="label-tag text-ink-faint">Staff · Investor interest</p>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.5rem] bg-paper-deep" />}>
          <Inbox searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function Inbox({ searchParams }: { searchParams: PageProps<"/admin/investors">["searchParams"] }) {
  await requireStaff(routes.investorInbox);
  const query = await searchParams;
  const requested = Array.isArray(query.status) ? query.status[0] : query.status;
  const status = ([...INVESTOR_STATUSES, "all"] as string[]).includes(requested ?? "") ? requested! : "open";

  const admin = createAdminClient();
  let list = admin
    .from("investor_interest")
    .select("id, full_name, email, firm, investor_type, check_size, accredited, message, status, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "open") list = list.in("status", OPEN);
  else if (status !== "all") list = list.eq("status", status as InvestorStatus);

  const [{ data: rows, error }, { data: everything }] = await Promise.all([list, admin.from("investor_interest").select("status, accredited").limit(5000)]);
  if (error) console.error("[investors] inbox failed to load", error.message);
  const all = everything ?? [];
  const href = (value: string) => (value === "open" ? routes.investorInbox : `${routes.investorInbox}?status=${value}`);

  return (
    <>
      <h1 className="text-3xl font-extrabold">Investor interest</h1>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Everyone" value={all.length} />
        <Stat label="New" value={all.filter((row) => row.status === "new").length} />
        <Stat label="In conversation" value={all.filter((row) => row.status === "contacted" || row.status === "meeting").length} />
        <Stat label="Committed" value={all.filter((row) => row.status === "committed").length} />
      </dl>

      <nav aria-label="Filter investors" className="mt-8 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="w-14 font-semibold text-ink-soft">Status</span>
        {([["open", "Open"], ...INVESTOR_STATUSES.map((value) => [value, INVESTOR_STATUS_LABELS[value]]), ["all", "All"]] as Array<[string, string]>).map(([value, label]) => (
          <Link
            key={value}
            href={href(value)}
            aria-current={value === status ? "true" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 font-semibold",
              value === status ? "border-brand-600 bg-brand-600 text-paper" : "border-line-strong bg-card text-ink hover:border-brand-200",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {rows?.length ? (
        <ul className="mt-6 space-y-4" data-testid="investor-inbox">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-lg font-bold">{row.full_name}</span>
                  {row.firm ? <span className="text-ink-soft">· {row.firm}</span> : null}
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 font-semibold text-brand-700">{investorTypeLabel(row.investor_type)}</span>
                  <span className="rounded-full bg-paper-deep px-2.5 py-0.5 font-semibold">{checkSizeLabel(row.check_size)}</span>
                  {row.accredited ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
                      <BadgeCheck className="size-4" aria-hidden="true" />
                      Accredited
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-ink-soft">
                  <a href={`mailto:${row.email}?subject=${encodeURIComponent("Investing in Swathbook")}`} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
                    <Mail className="size-3.5" aria-hidden="true" />
                    {row.email}
                  </a>
                  <span>{formatDateTime(row.created_at, "UTC")} UTC</span>
                </p>
                {row.message ? <p className="mt-3 whitespace-pre-wrap leading-relaxed">{row.message}</p> : null}
                <FollowUpForm id={row.id} status={row.status} notes={row.notes} />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-[1.25rem] border border-dashed border-line-strong p-8 text-center text-ink-soft">Nobody here yet. Try another filter.</p>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-bold">{value}</dd>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Mail, Star } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Card } from "@/components/app/ui";
import {
  FEEDBACK_STATUSES,
  KIND_LABELS,
  SOURCE_LABELS,
  TEAM_STATUS_LABELS,
  type FeedbackKind,
  type FeedbackSource,
  type FeedbackStatus,
} from "@/libs/feedback";
import { routes } from "@/libs/routes";
import { noIndex } from "@/libs/seo";
import { createAdminClient } from "@/libs/supabase/admin";
import { formatDateTime } from "@/libs/time";
import { cn } from "@/libs/utils";
import { TriageForm } from "./triage-form";
import { requireStaff } from "./staff";

export const metadata: Metadata = { title: "Feedback inbox", robots: noIndex };

const OPEN: FeedbackStatus[] = ["new", "reviewing", "planned"];
const KINDS: FeedbackKind[] = ["idea", "problem", "praise", "other"];
const SOURCES: FeedbackSource[] = ["web", "owner_app", "client_app"];

export default function FeedbackInboxPage({ searchParams }: PageProps<"/admin/feedback">) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo href={routes.home} />
          <p className="label-tag text-ink-faint">Staff · Feedback inbox</p>
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

function pick<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | null {
  const one = Array.isArray(value) ? value[0] : value;
  return allowed.includes(one as T) ? (one as T) : null;
}

async function Inbox({ searchParams }: { searchParams: PageProps<"/admin/feedback">["searchParams"] }) {
  await requireStaff();
  const query = await searchParams;
  const status = pick(query.status, [...FEEDBACK_STATUSES, "all"] as const) ?? "open";
  const kind = pick(query.kind, KINDS);
  const source = pick(query.source, SOURCES);

  const admin = createAdminClient();
  let notes = admin
    .from("feedback")
    .select("id, source, kind, rating, message, page, app_version, platform, email, contact_ok, status, response, responded_at, created_at, businesses(name, slug)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status === "open") notes = notes.in("status", OPEN);
  else if (status !== "all") notes = notes.eq("status", status);
  if (kind) notes = notes.eq("kind", kind);
  if (source) notes = notes.eq("source", source);

  const [{ data: rows, error }, { data: everything }] = await Promise.all([
    notes,
    // The headline numbers, over everything (a few hundred early users' worth).
    admin.from("feedback").select("status, rating, source").limit(5000),
  ]);
  if (error) console.error("[feedback] inbox failed to load", error.message);

  const all = everything ?? [];
  const ratings = all.map((row) => row.rating).filter((rating): rating is number => rating != null);
  const average = ratings.length ? (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1) : "–";
  const href = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const next = { status, kind, source, ...patch };
    for (const [key, value] of Object.entries(next)) if (value && !(key === "status" && value === "open")) params.set(key, value);
    const search = params.toString();
    return search ? `${routes.feedbackInbox}?${search}` : routes.feedbackInbox;
  };

  return (
    <>
      <h1 className="text-3xl font-extrabold">Feedback</h1>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="All notes" value={all.length} />
        <Stat label="New" value={all.filter((row) => row.status === "new").length} />
        <Stat label="Average rating" value={`${average}${ratings.length ? ` (${ratings.length})` : ""}`} />
        <Stat label="From the apps" value={all.filter((row) => row.source !== "web").length} />
      </dl>

      <nav aria-label="Filter feedback" className="mt-8 space-y-2 text-sm">
        <FilterRow
          label="Status"
          options={[["open", "Open"], ...FEEDBACK_STATUSES.map((value) => [value, TEAM_STATUS_LABELS[value]] as [string, string]), ["all", "All"]]}
          current={status}
          href={(value) => href({ status: value })}
        />
        <FilterRow label="Kind" options={[["", "Any"], ...KINDS.map((value) => [value, KIND_LABELS[value]] as [string, string])]} current={kind ?? ""} href={(value) => href({ kind: value || null })} />
        <FilterRow label="From" options={[["", "Anywhere"], ...SOURCES.map((value) => [value, SOURCE_LABELS[value]] as [string, string])]} current={source ?? ""} href={(value) => href({ source: value || null })} />
      </nav>

      {rows?.length ? (
        <ul className="mt-6 space-y-4" data-testid="feedback-inbox">
          {rows.map((note) => (
            <li key={note.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 font-semibold text-brand-700">{KIND_LABELS[note.kind]}</span>
                  {note.rating ? (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Star className="size-4 text-sun" aria-hidden="true" />
                      {note.rating}/5
                    </span>
                  ) : null}
                  <span className="text-ink-soft">{formatDateTime(note.created_at, "UTC")} UTC</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap leading-relaxed">{note.message}</p>
                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
                  <Context label="From">
                    {note.email ? (
                      note.contact_ok ? (
                        <a href={`mailto:${note.email}`} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
                          <Mail className="size-3.5" aria-hidden="true" />
                          {note.email}
                        </a>
                      ) : (
                        `${note.email} (no reply wanted)`
                      )
                    ) : (
                      "Deleted account"
                    )}
                  </Context>
                  {note.businesses ? <Context label="Business">{note.businesses.name}</Context> : null}
                  <Context label="Where">{[SOURCE_LABELS[note.source], note.page, note.app_version ? `v${note.app_version}` : null, note.platform].filter(Boolean).join(" · ")}</Context>
                </dl>
                <TriageForm id={note.id} status={note.status} response={note.response} />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 rounded-[1.25rem] border border-dashed border-line-strong p-8 text-center text-ink-soft">Nothing here. Try another filter.</p>
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

function Context({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="font-semibold">{label}:</dt>
      <dd>{children}</dd>
    </div>
  );
}

function FilterRow({ label, options, current, href }: { label: string; options: Array<[string, string]>; current: string; href: (value: string) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 font-semibold text-ink-soft">{label}</span>
      {options.map(([value, text]) => (
        <Link
          key={value || "any"}
          href={href(value)}
          aria-current={value === current ? "true" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center rounded-full border px-3 font-semibold",
            value === current ? "border-brand-600 bg-brand-600 text-paper" : "border-line-strong bg-card text-ink hover:border-brand-200",
          )}
        >
          {text}
        </Link>
      ))}
    </div>
  );
}

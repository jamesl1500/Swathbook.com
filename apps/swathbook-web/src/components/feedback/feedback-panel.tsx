import { MessageSquareReply } from "lucide-react";
import { Card, CardTitle } from "@/components/app/ui";
import { KIND_LABELS, STATUS_LABELS, type FeedbackKind, type FeedbackStatus } from "@/libs/feedback";
import { createClient } from "@/libs/supabase/server";
import { formatDateShort, toDateKey } from "@/libs/time";
import { cn } from "@/libs/utils";
import { FeedbackForm } from "./feedback-form";

type Note = {
  id: string;
  kind: FeedbackKind;
  message: string;
  status: FeedbackStatus;
  response: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  new: "bg-paper-deep text-ink-soft",
  reviewing: "bg-sun-soft text-ink",
  planned: "bg-brand-50 text-brand-700",
  done: "bg-brand-600 text-paper",
  closed: "bg-paper-deep text-ink-faint",
};

/** Only the paths of our own pages, so a crafted link can't put anything else on a note. */
function safePage(from: string | string[] | undefined) {
  const value = Array.isArray(from) ? from[0] : from;
  return value && /^\/[\w\-/.%[\]]{0,299}$/.test(value) && !value.startsWith("//") ? value : null;
}

/**
 * The feedback form and what the person has sent so far, with where each
 * note stands and any reply from the team. Shared by the dashboard and the
 * customer portal.
 */
export async function FeedbackPanel({ from, businessId, timeZone }: { from?: string | string[]; businessId?: string | null; timeZone: string }) {
  const supabase = await createClient();
  // RLS returns only the person's own notes.
  const { data } = await supabase.from("feedback").select("id, kind, message, status, response, created_at").order("created_at", { ascending: false }).limit(20);
  const notes = (data ?? []) as Note[];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <FeedbackForm page={safePage(from)} businessId={businessId} />
      </Card>
      <Card className="h-fit">
        <CardTitle>Your feedback</CardTitle>
        {notes.length ? (
          <ul className="mt-3 space-y-3" data-testid="feedback-history">
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-ink-soft">
                    {KIND_LABELS[note.kind]} · {formatDateShort(toDateKey(new Date(note.created_at), timeZone))}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 font-semibold", STATUS_STYLES[note.status])}>{STATUS_LABELS[note.status]}</span>
                </div>
                <p className="mt-1.5 line-clamp-3 text-sm">{note.message}</p>
                {note.response ? (
                  <p className="mt-2 flex gap-2 rounded-lg bg-brand-50 p-2 text-sm text-brand-700">
                    <MessageSquareReply className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      <span className="font-semibold">The team: </span>
                      {note.response}
                    </span>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">Nothing yet. Ideas, problems, praise: it all goes straight to the people building Swathbook.</p>
        )}
      </Card>
    </div>
  );
}

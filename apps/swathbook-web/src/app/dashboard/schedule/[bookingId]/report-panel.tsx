"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Camera, LoaderCircle, Trash } from "lucide-react";
import { toast } from "sonner";
import { CopyButton } from "@/components/app/copy-button";
import { Field, FormMessage } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/libs/forms";
import { shrinkImage } from "@/libs/image-resize";
import { MAX_JOB_PHOTOS } from "@/libs/supabase/storage";
import { cn } from "@/libs/utils";
import { deleteJobPhoto, saveReportNote, uploadJobPhoto } from "./report-actions";

export type ReportPhoto = { id: string; url: string | null; phase: "before" | "after"; canDelete: boolean };

/**
 * The crew's side of the job report: before and after photos and a note for
 * the customer, plus the link to what the customer sees.
 */
export function ReportPanel({
  businessId,
  bookingId,
  photos,
  note,
  reportUrl,
  completed,
}: {
  businessId: string;
  bookingId: string;
  photos: ReportPhoto[];
  note: string;
  reportUrl: string;
  completed: boolean;
}) {
  return (
    <div className="space-y-6">
      <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink-soft">
        {completed
          ? "The customer has a job report with these photos and your note."
          : "Add before photos when you arrive and after photos when you're done. The customer gets the report when the job is marked done."}
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        {(["before", "after"] as const).map((phase) => (
          <PhotoGroup
            key={phase}
            businessId={businessId}
            bookingId={bookingId}
            phase={phase}
            photos={photos.filter((photo) => photo.phase === phase)}
            room={MAX_JOB_PHOTOS - photos.length}
          />
        ))}
      </div>
      <NoteForm businessId={businessId} bookingId={bookingId} note={note} />
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5 text-sm">
        <span className="text-ink-soft">The customer&apos;s report:</span>
        <a href={reportUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center font-semibold text-brand-600 hover:underline">
          Open it
        </a>
        <CopyButton value={reportUrl} label="Copy link" />
      </div>
    </div>
  );
}

function PhotoGroup({
  businessId,
  bookingId,
  phase,
  photos,
  room,
}: {
  businessId: string;
  bookingId: string;
  phase: "before" | "after";
  photos: ReportPhoto[];
  room: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(0);
  const label = phase === "before" ? "Before" : "After";

  async function upload(files: File[]) {
    const batch = files.slice(0, Math.max(0, room));
    if (files.length > batch.length) toast.info(`Adding the first ${batch.length}. A report holds up to ${MAX_JOB_PHOTOS} photos.`);
    setUploading(batch.length);
    let added = 0;
    for (const file of batch) {
      let image: File;
      try {
        // Phone photos are big; this also strips their GPS metadata.
        image = await shrinkImage(file, { maxSize: 1600 });
      } catch {
        toast.error(`We couldn't read ${file.name}. Try a JPG or PNG.`);
        setUploading((count) => count - 1);
        continue;
      }
      const formData = new FormData();
      formData.set("businessId", businessId);
      formData.set("bookingId", bookingId);
      formData.set("phase", phase);
      formData.set("image", image);
      const result = await uploadJobPhoto(formData).catch(() => ({ error: "Couldn't upload that. Check your connection and try again." }) as FormState);
      if (result.error) toast.error(result.error);
      else added += 1;
      setUploading((count) => count - 1);
    }
    if (added) toast.success(added === 1 ? `${label} photo added.` : `${added} ${phase} photos added.`);
  }

  function remove(photoId: string) {
    const formData = new FormData();
    formData.set("businessId", businessId);
    formData.set("photoId", photoId);
    startTransition(async () => {
      const result = await deleteJobPhoto(formData);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <section aria-labelledby={`photos-${phase}`} data-testid={`photos-${phase}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`photos-${phase}`} className="font-bold">
          {label}
        </h3>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading > 0 || room <= 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold hover:border-ink-faint disabled:opacity-50"
        >
          {uploading > 0 ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
          {uploading > 0 ? `Uploading ${uploading}…` : `Add ${phase} photos`}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
          multiple
          className="sr-only"
          aria-label={`Add ${phase} photos`}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) void upload(files);
          }}
        />
      </div>
      {photos.length ? (
        <ul className={cn("mt-3 grid grid-cols-3 gap-2", pending && "opacity-60")}>
          {photos.map((photo) => (
            <li key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-paper-deep">
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL from private job storage
                <img src={photo.url} alt={`${label} photo`} loading="lazy" className="size-full object-cover" />
              ) : null}
              {photo.canDelete ? (
                <button
                  type="button"
                  onClick={() => remove(photo.id)}
                  aria-label={`Remove ${phase} photo`}
                  className="absolute right-1.5 top-1.5 grid size-9 place-items-center rounded-full bg-card/90 text-ink-soft shadow-lift hover:text-clay"
                >
                  <Trash className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-faint">No {phase} photos yet.</p>
      )}
    </section>
  );
}

function NoteForm({ businessId, bookingId, note }: { businessId: string; bookingId: string; note: string }) {
  const [state, formAction] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveReportNote(prev, formData);
    if (result.success) toast.success(result.success);
    return result;
  }, {});
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="bookingId" value={bookingId} />
      {state.error && !state.fieldErrors ? <FormMessage>{state.error}</FormMessage> : null}
      <Field label="Note for the customer" htmlFor="report-note" hint="Shown on their job report." error={state.fieldErrors?.note?.[0]}>
        <textarea
          id="report-note"
          name="note"
          rows={3}
          maxLength={1000}
          defaultValue={note}
          placeholder="Edged along the driveway and bagged the clippings. The back gate latch is loose."
          className="block w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[0.95rem] focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-200"
        />
      </Field>
      <SubmitButton pendingLabel="Saving…">Save note</SubmitButton>
    </form>
  );
}

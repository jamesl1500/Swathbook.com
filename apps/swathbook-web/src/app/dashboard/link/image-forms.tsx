"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, ImageUp, LoaderCircle, Trash } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";
import type { FormState } from "@/libs/forms";
import { shrinkImage } from "@/libs/image-resize";
import { MAX_PHOTOS } from "@/libs/supabase/storage";
import { brandTextColor, cn } from "@/libs/utils";
import { deletePhoto, movePhoto, removeCover, removeLogo, savePhotoCaption, uploadCover, uploadLogo, uploadPhoto } from "./actions";

type Action = (formData: FormData) => Promise<FormState>;

function useBusinessAction(businessId: string) {
  const [pending, startTransition] = useTransition();
  function run(action: Action, fields: Record<string, string | File>, { quiet = false } = {}) {
    return new Promise<boolean>((resolve) =>
      startTransition(async () => {
        const formData = new FormData();
        formData.set("businessId", businessId);
        for (const [key, value] of Object.entries(fields)) formData.set(key, value);
        const result = await action(formData);
        if (result.error) toast.error(result.error);
        else if (result.success && !quiet) toast.success(result.success);
        resolve(!result.error);
      }),
    );
  }
  return { pending, run };
}

/**
 * A file picker styled as a button. The input stays in the tab order (visually
 * hidden), so keyboard and screen-reader users can use it like any button.
 */
function PickButton({
  id,
  label,
  multiple = false,
  disabled,
  pending,
  onPick,
  icon,
}: {
  id: string;
  label: string;
  multiple?: boolean;
  disabled?: boolean;
  pending?: boolean;
  onPick: (files: File[]) => void;
  icon: ReactNode;
}) {
  return (
    <span className="relative inline-flex">
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
        multiple={multiple}
        disabled={disabled || pending}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onPick(files);
        }}
        className="peer sr-only"
      />
      <label
        htmlFor={id}
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-card px-4 text-sm font-semibold text-ink hover:border-ink-soft",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-brand-500",
          (disabled || pending) && "pointer-events-none opacity-60",
        )}
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : icon}
        {pending ? "Uploading…" : label}
      </label>
    </span>
  );
}

async function prepare(file: File, maxSize: number) {
  try {
    return await shrinkImage(file, { maxSize });
  } catch {
    toast.error(`We couldn't read ${file.name}. Try a JPG or PNG.`);
    return null;
  }
}

export function LogoForm({ businessId, logoUrl, businessName }: { businessId: string; logoUrl: string | null; businessName: string }) {
  const { pending, run } = useBusinessAction(businessId);
  return (
    <div className="flex items-center gap-4">
      <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-paper">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from Supabase Storage
          <img src={logoUrl} alt={`${businessName} logo`} className="size-full object-cover" />
        ) : (
          <span className="font-display text-2xl font-bold text-ink-faint">{businessName.slice(0, 2).toUpperCase()}</span>
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-ink-soft">A square logo looks best. We&apos;ll resize it for you.</p>
        <div className="flex flex-wrap gap-2">
          <PickButton
            id="logo-upload"
            label={logoUrl ? "Change logo" : "Upload logo"}
            pending={pending}
            icon={<ImageUp className="size-4" aria-hidden="true" />}
            onPick={async ([file]) => {
              const image = await prepare(file, 512);
              if (image) await run(uploadLogo, { image });
            }}
          />
          {logoUrl ? (
            <Button size="sm" variant="ghost" className="min-h-11" disabled={pending} onClick={() => run(removeLogo, {})}>
              <Trash className="size-4" aria-hidden="true" />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CoverForm({ businessId, coverUrl, brandColor }: { businessId: string; coverUrl: string | null; brandColor: string }) {
  const { pending, run } = useBusinessAction(businessId);
  return (
    <div className="space-y-3">
      <div
        className="relative aspect-[16/7] overflow-hidden rounded-2xl border border-line"
        style={coverUrl ? undefined : { backgroundColor: brandColor }}
        data-testid="cover-preview"
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from Supabase Storage
          <img src={coverUrl} alt="Cover photo" className="size-full object-cover" />
        ) : (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm font-semibold" style={{ color: brandTextColor(brandColor) }}>
            No cover photo yet. Your brand color shows here.
          </p>
        )}
      </div>
      <p className="text-sm text-ink-soft">A wide photo of your work, your van or your team. It sits behind your name at the top of your page.</p>
      <div className="flex flex-wrap gap-2">
        <PickButton
          id="cover-upload"
          label={coverUrl ? "Change cover photo" : "Upload cover photo"}
          pending={pending}
          icon={<ImageUp className="size-4" aria-hidden="true" />}
          onPick={async ([file]) => {
            const image = await prepare(file, 2000);
            if (image) await run(uploadCover, { image });
          }}
        />
        {coverUrl ? (
          <Button size="sm" variant="ghost" className="min-h-11" disabled={pending} onClick={() => run(removeCover, {})}>
            <Trash className="size-4" aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export type EditablePhoto = { id: string; url: string; caption: string | null };

export function PhotosForm({ businessId, photos }: { businessId: string; photos: EditablePhoto[] }) {
  const { pending, run } = useBusinessAction(businessId);
  const [progress, setProgress] = useState<string | null>(null);
  const room = MAX_PHOTOS - photos.length;

  async function addPhotos(files: File[]) {
    const batch = files.slice(0, room);
    if (files.length > room) toast.info(`Adding the first ${room}. Your page holds up to ${MAX_PHOTOS} photos.`);
    let added = 0;
    for (const [index, file] of batch.entries()) {
      setProgress(`Adding ${index + 1} of ${batch.length}…`);
      const image = await prepare(file, 1600);
      if (image && (await run(uploadPhoto, { image }, { quiet: true }))) added += 1;
    }
    setProgress(null);
    if (added) toast.success(added === 1 ? "Photo added." : `${added} photos added.`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          Show customers your work. <span className="font-semibold text-ink">{photos.length}</span> of {MAX_PHOTOS}.
        </p>
        <PickButton
          id="photos-upload"
          label="Add photos"
          multiple
          disabled={room <= 0}
          pending={pending || progress !== null}
          icon={<ImagePlus className="size-4" aria-hidden="true" />}
          onPick={addPhotos}
        />
      </div>
      {progress ? (
        <p role="status" className="text-sm font-semibold text-brand-600">
          {progress}
        </p>
      ) : null}

      {photos.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="overflow-hidden rounded-2xl border border-line bg-paper" data-testid="photo-tile">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from Supabase Storage */}
              <img src={photo.url} alt={photo.caption || `Photo ${index + 1}`} className="aspect-square w-full object-cover" />
              <div className="space-y-2 p-2">
                <label htmlFor={`caption-${photo.id}`} className="sr-only">
                  Caption for photo {index + 1}
                </label>
                <input
                  id={`caption-${photo.id}`}
                  defaultValue={photo.caption ?? ""}
                  maxLength={140}
                  placeholder="Add a caption"
                  onBlur={(event) => {
                    if (event.target.value.trim() !== (photo.caption ?? "")) {
                      run(savePhotoCaption, { photoId: photo.id, caption: event.target.value });
                    }
                  }}
                  className={cn(inputStyles, "px-2.5 py-1.5 text-sm")}
                />
                <div className="flex items-center justify-between">
                  <span className="flex">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-10 px-0"
                      disabled={pending || index === 0}
                      onClick={() => run(movePhoto, { photoId: photo.id, direction: "earlier" })}
                    >
                      <ArrowLeft className="size-4" aria-hidden="true" />
                      <span className="sr-only">Move photo {index + 1} earlier</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-10 px-0"
                      disabled={pending || index === photos.length - 1}
                      onClick={() => run(movePhoto, { photoId: photo.id, direction: "later" })}
                    >
                      <ArrowRight className="size-4" aria-hidden="true" />
                      <span className="sr-only">Move photo {index + 1} later</span>
                    </Button>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-10 px-0 text-clay hover:text-clay"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm("Remove this photo from your page?")) run(deletePhoto, { photoId: photo.id });
                    }}
                  >
                    <Trash className="size-4" aria-hidden="true" />
                    <span className="sr-only">Remove photo {index + 1}</span>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-soft">
          No photos yet. Before-and-afters work great.
        </p>
      )}
    </div>
  );
}

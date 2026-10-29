"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type GalleryPhoto = { id: string; url: string; caption: string | null };

/**
 * "Our work": swipeable on phones, a grid on larger screens. Tapping a photo
 * opens it full screen with previous/next controls (arrow keys work too).
 */
export function PhotoGallery({ photos, businessName, tradeName }: { photos: GalleryPhoto[]; businessName: string; tradeName?: string }) {
  // Captions are the best alt text; otherwise say what kind of work it shows.
  const fallbackAlt = (index: number) => `${businessName}${tradeName ? ` ${tradeName.toLowerCase()}` : ""} work, photo ${index + 1}`;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(0);
  if (!photos.length) return null;

  const show = (index: number) => setOpen((index + photos.length) % photos.length);
  const current = photos[open];

  return (
    <section aria-labelledby="gallery-heading" className="min-w-0">
      <h2 id="gallery-heading" className="text-xl font-bold">
        Our work
      </h2>
      <ul className="-mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
        {photos.map((photo, index) => (
          <li key={photo.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setOpen(index);
                dialogRef.current?.showModal();
              }}
              className="block w-full overflow-hidden rounded-2xl border border-line bg-paper-deep"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from Supabase Storage */}
              <img
                src={photo.url}
                alt={photo.caption || fallbackAlt(index)}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
              />
            </button>
            {photo.caption ? <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{photo.caption}</p> : null}
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={`${businessName} photos`}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") show(open + 1);
          if (event.key === "ArrowLeft") show(open - 1);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-none max-w-none bg-transparent p-0 backdrop:bg-ink/85"
      >
        <figure className="relative flex h-dvh w-screen flex-col items-center justify-center gap-3 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from Supabase Storage */}
          <img
            src={current.url}
            alt={current.caption || fallbackAlt(open)}
            className="max-h-[80dvh] max-w-full rounded-2xl object-contain"
          />
          <figcaption className="max-w-xl text-center text-sm text-white">
            {current.caption ? `${current.caption} · ` : ""}
            {open + 1} of {photos.length}
          </figcaption>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="absolute right-4 top-4 grid size-12 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <X className="size-6" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
          {photos.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => show(open - 1)}
                className="absolute left-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <ChevronLeft className="size-6" aria-hidden="true" />
                <span className="sr-only">Previous photo</span>
              </button>
              <button
                type="button"
                onClick={() => show(open + 1)}
                className="absolute right-3 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
              >
                <ChevronRight className="size-6" aria-hidden="true" />
                <span className="sr-only">Next photo</span>
              </button>
            </>
          ) : null}
        </figure>
      </dialog>
    </section>
  );
}

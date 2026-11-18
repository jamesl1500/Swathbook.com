"use client";

import { useId, useState } from "react";

/**
 * One before and one after photo, stacked, with a slider that wipes between
 * them. The slider is a plain range input, so it works by touch, mouse and
 * keyboard alike.
 */
export function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [split, setSplit] = useState(50);
  const id = useId();
  return (
    <figure className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[1.25rem] border border-line bg-paper-deep">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private job photo */}
        <img src={after} alt="After" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private job photo */}
          <img src={before} alt="Before" className="absolute inset-0 size-full object-cover" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-lift" style={{ left: `${split}%` }} aria-hidden="true" />
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-[#0b1220]/75 px-2.5 py-1 text-xs font-bold text-white">Before</span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-[#0b1220]/75 px-2.5 py-1 text-xs font-bold text-white">After</span>
      </div>
      <label htmlFor={id} className="sr-only">
        Slide between the before and after photos
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={split}
        onChange={(event) => setSplit(Number(event.target.value))}
        className="w-full accent-[var(--color-brand-600)]"
      />
    </figure>
  );
}

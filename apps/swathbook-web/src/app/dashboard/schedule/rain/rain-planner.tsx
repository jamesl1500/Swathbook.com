"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CloudRain, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { formatDateShort, formatTime, toDateKey } from "@/libs/time";
import { cn } from "@/libs/utils";
import { applyRainDelay, previewRainDelay, type RainMove } from "./actions";

type Preview = { moves: RainMove[]; unplaced: RainMove[] };

/**
 * Pick the rainy day and where its jobs go, look at where each one would
 * land, untick any to leave alone, then move them all at once.
 */
export function RainPlanner({
  businessId,
  timeZone,
  today,
  lastDay,
  rainDate,
  atRisk,
  forecast,
  choices,
  suggested,
}: {
  businessId: string;
  timeZone: string;
  today: string;
  lastDay: string;
  rainDate: string | null;
  atRisk: number | null;
  forecast: { chance: number; summary: string | null } | null;
  choices: Array<{ date: string; rainChance: number | null }>;
  suggested: string | null;
}) {
  const [from, setFrom] = useState(rainDate ?? today);
  const [to, setTo] = useState(suggested ?? choices[0]?.date ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [skip, setSkip] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const time = (iso: string) => formatTime(iso, timeZone);
  const day = (iso: string) => formatDateShort(toDateKey(new Date(iso), timeZone));
  const moving = preview ? preview.moves.filter((move) => !skip.includes(move.bookingId)) : [];

  function run(apply: boolean) {
    setError(null);
    startTransition(async () => {
      const input = { businessId, from, to, skip, forecast: from === rainDate ? forecast : null };
      const result = apply ? await applyRainDelay(input) : await previewRainDelay(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (apply) {
        const message = `Moved ${result.moves.length} ${result.moves.length === 1 ? "job" : "jobs"} to ${formatDateShort(to)}. Customers are getting an email.`;
        toast.success(message);
        setDone(message);
        setPreview(null);
        setSkip([]);
        return;
      }
      setPreview({ moves: result.moves, unplaced: result.unplaced });
      setSkip([]);
    });
  }

  function changeDays(next: { from?: string; to?: string }) {
    if (next.from !== undefined) setFrom(next.from);
    if (next.to !== undefined) setTo(next.to);
    setPreview(null);
    setDone(null);
  }

  return (
    <div className="space-y-5">
      {rainDate && atRisk ? (
        <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
          <CloudRain className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {forecast ? `${forecast.chance}% chance of rain${forecast.summary ? ` (${forecast.summary.toLowerCase()})` : ""}. ` : ""}
            {atRisk} outdoor {atRisk === 1 ? "job is" : "jobs are"} booked that day.
          </span>
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <Field label="Rainy day" htmlFor="rain-from">
          <Input id="rain-from" type="date" min={today} max={lastDay} value={from} onChange={(event) => changeDays({ from: event.target.value })} />
        </Field>
        <ArrowRight className="mx-auto mb-3 hidden size-5 text-ink-faint sm:block" aria-hidden="true" />
        <Field label="Move jobs to" htmlFor="rain-to" hint={to === suggested ? "The next open day that looks dry." : undefined}>
          <Select id="rain-to" value={to} onChange={(event) => changeDays({ to: event.target.value })}>
            {choices
              .filter((choice) => choice.date !== from)
              .map((choice) => (
                <option key={choice.date} value={choice.date}>
                  {formatDateShort(choice.date)}
                  {choice.rainChance != null ? ` · ${choice.rainChance}% rain` : ""}
                </option>
              ))}
          </Select>
        </Field>
      </div>

      {error ? <FormMessage>{error}</FormMessage> : null}
      {done ? <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700" role="status">{done}</p> : null}

      {!preview ? (
        <Button onClick={() => run(false)} disabled={pending || !from || !to}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          See where jobs would go
        </Button>
      ) : (
        <div className="space-y-4" data-testid="rain-preview">
          {preview.moves.length === 0 && preview.unplaced.length === 0 ? (
            <p className="rounded-xl bg-paper px-4 py-5 text-center text-sm text-ink-soft">No outdoor jobs to move that day.</p>
          ) : null}

          {preview.moves.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {preview.moves.map((move) => {
                const kept = !skip.includes(move.bookingId);
                return (
                  <li key={move.bookingId}>
                    <label className={cn("flex cursor-pointer items-start gap-3 px-4 py-3 text-sm", !kept && "opacity-55")}>
                      <input
                        type="checkbox"
                        checked={kept}
                        onChange={() => setSkip((current) => (kept ? [...current, move.bookingId] : current.filter((id) => id !== move.bookingId)))}
                        className="mt-1 size-4 accent-[var(--color-brand-600)]"
                        aria-label={`Move ${move.customerName}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{move.customerName}</span>
                        <span className="block truncate text-ink-soft">{move.services}</span>
                      </span>
                      <span className="text-right">
                        <span className="block whitespace-nowrap">
                          <span className="text-ink-faint line-through">{time(move.fromStart)}</span> → <strong>{day(move.toStart!)} {time(move.toStart!)}</strong>
                        </span>
                        {move.reassigned && move.memberName ? <span className="block text-xs text-ink-soft">now with {move.memberName}</span> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {preview.unplaced.length ? (
            <div className="rounded-xl border border-sun/60 bg-sun-soft px-4 py-3 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <TriangleAlert className="size-4" aria-hidden="true" />
                No room on {formatDateShort(to)} for {preview.unplaced.length} {preview.unplaced.length === 1 ? "job" : "jobs"}. They&apos;ll stay put:
              </p>
              <ul className="mt-1 list-disc pl-6">
                {preview.unplaced.map((job) => (
                  <li key={job.bookingId}>
                    {job.customerName}
                    {job.fromStart ? ` · ${time(job.fromStart)}` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-ink-soft">Pick another day, or move them one by one from the job page.</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(true)} disabled={pending || moving.length === 0}>
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CloudRain className="size-4" aria-hidden="true" />}
              Move {moving.length} {moving.length === 1 ? "job" : "jobs"} and email customers
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={pending}>
              Change days
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

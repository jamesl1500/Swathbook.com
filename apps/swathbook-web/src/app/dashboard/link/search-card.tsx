import { Check, Circle } from "lucide-react";
import { Card, CardTitle } from "@/components/app/ui";
import { findTrade } from "@/libs/marketing/content";
import { businessPageMeta } from "@/libs/seo";
import { cn } from "@/libs/utils";

type SearchBusiness = {
  name: string;
  trade: string;
  description: string | null;
  service_area: string | null;
  phone: string | null;
  logo_path: string | null;
  cover_path: string | null;
};

/**
 * How the booking page shows up in Google, what helps it rank, and where to
 * share the link so it brings customers in.
 */
export function SearchCard({
  business,
  displayUrl,
  services,
  photoCount,
}: {
  business: SearchBusiness;
  displayUrl: string;
  services: Array<{ name: string; description: string | null }>;
  photoCount: number;
}) {
  const { fullTitle, description } = businessPageMeta({ business, services, tradeName: findTrade(business.trade)?.name });
  const checks = [
    { done: (business.description?.trim().length ?? 0) >= 60, label: "Describe your business in a sentence or two", hint: "Becomes your Google snippet." },
    { done: Boolean(business.service_area?.trim()), label: "Add the area you serve", hint: "Most people search with a place name." },
    {
      done: services.length > 0 && services.every((service) => service.description?.trim()),
      label: "Describe every service",
      hint: "More words customers search for.",
    },
    { done: Boolean(business.phone), label: "Add a phone number", hint: "Builds trust and helps local results." },
    { done: Boolean(business.logo_path), label: "Upload your logo", hint: "Shows on your page and share previews." },
    { done: Boolean(business.cover_path), label: "Add a cover photo", hint: "Makes your link stand out when shared." },
    { done: photoCount >= 3, label: "Show at least 3 photos of your work", hint: "Photos can appear in image search." },
  ];
  const done = checks.filter((check) => check.done).length;

  return (
    <Card>
      <CardTitle action={<span className="rounded-full bg-paper-deep px-3 py-1 text-sm font-semibold text-ink-soft" data-testid="seo-score">{`${done} of ${checks.length} done`}</span>}>
        Search &amp; sharing
      </CardTitle>

      <p className="label-tag text-ink-faint">How you&apos;ll look on Google</p>
      <div className="mt-2 rounded-2xl border border-line bg-white p-4" data-testid="search-preview">
        <p className="truncate text-sm text-[#202124]">{displayUrl}</p>
        <p className="mt-1 line-clamp-2 text-lg leading-snug text-[#1a0dab]">{fullTitle}</p>
        <p className="mt-1 line-clamp-3 text-sm text-[#4d5156]">{description}</p>
      </div>

      <ul className="mt-5 space-y-2.5">
        {checks.map((check) => (
          <li key={check.label} className="flex gap-3">
            <span
              className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", check.done ? "bg-brand-600 text-paper" : "border-2 border-line-strong")}
              aria-hidden="true"
            >
              {check.done ? <Check className="size-3" /> : <Circle className="size-2 opacity-0" />}
            </span>
            <span className="text-sm">
              <span className={cn("font-semibold", check.done && "text-ink-soft line-through decoration-1")}>{check.label}</span>
              <span className="sr-only">{check.done ? " (done)" : " (to do)"}</span>
              {!check.done ? <span className="block text-ink-soft">{check.hint}</span> : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-2xl bg-paper p-4 text-sm">
        <p className="font-bold">Get more people to your link</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-ink-soft">
          <li>
            <strong className="text-ink">Add it to your Google Business Profile</strong> as your booking (appointment) link, so people can book straight
            from Google Search and Maps.
          </li>
          <li>Put it in your Instagram, Facebook and Nextdoor bios, and on your truck or van with the QR code above.</li>
          <li>Ask happy customers for a Google review after each job. Reviews are a big part of how local businesses rank.</li>
          <li>Link to it from your website with the &ldquo;Book now&rdquo; button below.</li>
        </ol>
      </div>
    </Card>
  );
}

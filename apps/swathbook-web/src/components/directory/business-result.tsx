import Link from "next/link";
import { ArrowRight, CreditCard, MapPin } from "lucide-react";
import { fromPrice, type DirectoryBusiness } from "@/libs/business-directory";
import { findTrade } from "@/libs/marketing/content";
import { businessPagePath } from "@/libs/routes";
import { publicAssetUrl } from "@/libs/supabase/storage";
import { brandOnLight } from "@/libs/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A business in directory results. The name is the link; it stretches over
 * the card so the whole card is clickable while screen readers hear one link.
 */
export function BusinessResult({ business, headingLevel = "h2" }: { business: DirectoryBusiness; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  const logo = publicAssetUrl(business.logo_path);
  const brand = business.brand_color ?? "#1c3d70";
  const price = fromPrice(business);
  const tradeName = findTrade(business.trade)?.name;
  const services = `${business.service_count} ${business.service_count === 1 ? "service" : "services"}`;

  return (
    <article className="group relative flex gap-4 rounded-[1.25rem] border border-line bg-card p-4 transition-[border-color,box-shadow] hover:border-ink-faint hover:shadow-card focus-within:ring-3 focus-within:ring-brand-200 sm:p-5">
      <span
        className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-paper font-display text-lg font-bold"
        style={{ color: brandOnLight(brand) }}
        aria-hidden="true"
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo from Supabase Storage
          <img src={logo} alt="" width={56} height={56} loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          initials(business.name)
        )}
      </span>
      <div className="min-w-0 flex-1">
        <Heading className="text-lg font-bold leading-snug">
          <Link href={businessPagePath(business.slug)} className="after:absolute after:inset-0 after:rounded-[1.25rem] focus-visible:outline-none">
            {business.name}
          </Link>
        </Heading>
        <p className="mt-0.5 text-sm text-ink-soft">{[tradeName, services, price ? `from ${price}` : null].filter(Boolean).join(" · ")}</p>
        {business.service_area ? (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-faint">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Serving {business.service_area}</span>
          </p>
        ) : null}
        {business.description ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-soft">{business.description}</p> : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {business.accepts_online_payments ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              <CreditCard className="size-3.5" aria-hidden="true" />
              Pay online
            </span>
          ) : (
            <span className="rounded-full bg-paper-deep px-2.5 py-1 text-xs font-semibold text-ink-soft">Pay on site</span>
          )}
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 group-hover:text-brand-700" aria-hidden="true">
            See times
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </article>
  );
}

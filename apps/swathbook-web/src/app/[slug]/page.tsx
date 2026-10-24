import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Clock, Globe, Phone, ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { JsonLd } from "@/components/seo/json-ld";
import { loadBookingPage, loadPausedBusinessName, type BookingPageData } from "@/libs/booking-page";
import { siteConfig } from "@/libs/globals/site";
import { hasGoogleMaps } from "@/libs/google/maps";
import { findTrade } from "@/libs/marketing/content";
import { routes } from "@/libs/routes";
import { businessJsonLd, metaDescription } from "@/libs/seo";
import { publicAssetUrl } from "@/libs/supabase/storage";
import { formatTimeKey, todayKey } from "@/libs/time";
import { brandOnLight, brandTextColor, cn } from "@/libs/utils";
import { BookingFlow } from "./booking-flow";
import { PhotoGallery } from "./photo-gallery";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadBookingPage(slug);
  // Paused or unknown pages stay out of search results.
  if (!page) return { title: "Book online", robots: { index: false, follow: false } };
  const { business, services } = page;
  const tradeName = findTrade(business.trade)?.name;
  const title = `Book ${business.name} online`;
  const serviceNames = services.slice(0, 3).map((service) => service.name.toLowerCase());
  const description = metaDescription(
    business.description ||
      `${business.name}${tradeName ? `, ${tradeName.toLowerCase()}` : ""}: ${
        serviceNames.length ? `${serviceNames.join(", ")} and more. ` : ""
      }See prices, pick a time and book online in under a minute.`,
  );
  return {
    title: { absolute: tradeName ? `${title} · ${tradeName}` : title },
    description,
    alternates: { canonical: `/${business.slug}` },
    // The share image comes from ./opengraph-image.tsx.
    openGraph: { type: "website", siteName: siteConfig.name, title, description, url: `/${business.slug}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function BusinessBookingPage({ params }: PageProps<"/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BookingPageContent params={params} />
    </Suspense>
  );
}

async function BookingPageContent({ params }: { params: PageProps<"/[slug]">["params"] }) {
  const { slug } = await params;
  const page = await loadBookingPage(slug);
  if (!page) {
    const pausedName = await loadPausedBusinessName(slug);
    if (pausedName) return <PausedNotice name={pausedName} />;
    notFound();
  }
  return <BookingPage page={page} googleEnabled={hasGoogleMaps()} />;
}

function BookingPage({ page, googleEnabled }: { page: BookingPageData; googleEnabled: boolean }) {
  const { business, services, hours } = page;
  const brand = business.brand_color ?? "#1c3d70";
  const logo = publicAssetUrl(business.logo_path);
  const cover = publicAssetUrl(business.cover_path);
  // Over a photo, text is always white on a dark scrim; otherwise it follows the brand color.
  const onHeader = cover ? "#ffffff" : brandTextColor(brand);
  const photos = (page.photos ?? []).map((photo) => ({ id: photo.id, url: publicAssetUrl(photo.storage_path) ?? "", caption: photo.caption }));
  const initials = business.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-dvh bg-paper" style={{ "--brand": brand } as React.CSSProperties}>
      <JsonLd data={businessJsonLd({ business, services, hours, logoUrl: logo, tradeName: findTrade(business.trade)?.name })} />
      <header
        className="relative overflow-hidden text-(color:--on-brand)"
        style={{ backgroundColor: brand, "--on-brand": onHeader } as React.CSSProperties}
      >
        {cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded cover from Supabase Storage */}
            <img src={cover} alt="" className="absolute inset-0 size-full object-cover" fetchPriority="high" />
            <div className="absolute inset-0 bg-linear-to-t from-[#0b1220]/90 via-[#0b1220]/70 to-[#0b1220]/40" aria-hidden="true" />
          </>
        ) : null}
        <div className={cn("relative mx-auto max-w-5xl px-4 pb-8 sm:px-6", cover ? "pt-28 sm:pt-40" : "pt-8 sm:pb-10")}>
          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/95 font-display text-xl font-bold" style={{ color: brandOnLight(brand) }}>
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded logo from Supabase Storage
                <img src={logo} alt="" className="size-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{business.name}</h1>
              <p className="mt-1 text-(color:--on-brand)/85">Book online in under a minute</p>
            </div>
          </div>
          {business.description ? <p className="mt-5 max-w-2xl leading-relaxed text-(color:--on-brand)/90">{business.description}</p> : null}
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-(color:--on-brand)/90">
            {business.phone ? (
              <a href={`tel:${business.phone}`} className="inline-flex items-center gap-1.5 hover:underline">
                <Phone className="size-4" aria-hidden="true" />
                {business.phone}
              </a>
            ) : null}
            {business.website_url ? (
              <a href={business.website_url} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1.5 hover:underline">
                <Globe className="size-4" aria-hidden="true" />
                {business.website_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <BookingFlow
          slug={business.slug}
          services={services}
          timeZone={business.timezone}
          currency={business.currency}
          brandColor={brand}
          acceptsPayments={business.accepts_online_payments}
          googleEnabled={googleEnabled}
          startDate={todayKey(business.timezone)}
        />

        {photos.length ? (
          <div className="min-w-0 lg:col-start-1">
            <PhotoGallery photos={photos} businessName={business.name} />
          </div>
        ) : null}

        <aside className="space-y-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-start">
          {hours.length ? (
            <section className="rounded-[1.25rem] border border-line bg-card p-5">
              <h2 className="flex items-center gap-2 font-bold">
                <Clock className="size-4" aria-hidden="true" />
                Hours
              </h2>
              <dl className="mt-3 space-y-1.5 text-sm">
                {WEEKDAYS.map((day, index) => {
                  const row = hours.find((hour) => hour.weekday === index);
                  return (
                    <div key={day} className="flex justify-between gap-3">
                      <dt className="text-ink-soft">{day}</dt>
                      <dd className={row ? "font-semibold" : "text-ink-faint"}>
                        {row ? `${formatTimeKey(row.opens_at.slice(0, 5))} – ${formatTimeKey(row.closes_at.slice(0, 5))}` : "Closed"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          ) : null}
          <section className="rounded-[1.25rem] border border-line bg-card p-5 text-sm text-ink-soft">
            <h2 className="flex items-center gap-2 font-bold text-ink">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Good to know
            </h2>
            <p className="mt-2">
              {business.cancellation_window_hours > 0
                ? `Need to cancel? Please let us know at least ${business.cancellation_window_hours} hours ahead.`
                : "You can cancel anytime before your appointment."}
            </p>
            {business.accepts_online_payments ? (
              <p className="mt-2">
                {business.deposit_refund_policy === "non_refundable"
                  ? "Deposits are non-refundable."
                  : business.deposit_refund_policy === "refundable"
                    ? "Deposits are refundable if you cancel."
                    : `Deposits are refundable if you cancel at least ${business.cancellation_window_hours} hours ahead.`}
              </p>
            ) : null}
          </section>
        </aside>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-faint">
        <Link href={routes.home} className="inline-flex items-center gap-1.5 hover:text-ink">
          <LogoMark className="size-4" />
          Booking powered by {siteConfig.name}
        </Link>
      </footer>
    </div>
  );
}

function PausedNotice({ name }: { name: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4">
      <div className="max-w-md text-center">
        <p className="label-tag text-ink-faint">Online booking</p>
        <h1 className="mt-3 text-3xl font-extrabold">{name} isn&apos;t taking online bookings right now</h1>
        <p className="mt-3 text-ink-soft">Please check back soon, or contact them directly.</p>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="min-h-dvh bg-paper" aria-busy="true">
      <div className="h-56 animate-pulse bg-paper-deep" />
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10 sm:px-6">
        <div className="h-8 w-1/3 animate-pulse rounded-lg bg-paper-deep" />
        <div className="h-24 animate-pulse rounded-2xl bg-paper-deep" />
        <div className="h-24 animate-pulse rounded-2xl bg-paper-deep" />
      </div>
    </div>
  );
}

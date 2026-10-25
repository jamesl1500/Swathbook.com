import type { Metadata } from "next";
import { Suspense } from "react";
import QRCode from "qrcode";
import { Card, CardTitle, ManagersOnly, PageHeader } from "@/components/app/ui";
import { requireBusinessContext } from "@/libs/dashboard";
import { siteConfig } from "@/libs/globals/site";
import { businessPagePath, routes } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { createClient } from "@/libs/supabase/server";
import { publicAssetUrl } from "@/libs/supabase/storage";
import { brandOnLight } from "@/libs/utils";
import { CoverForm, LogoForm, PhotosForm } from "./image-forms";
import { PublishToggle, ProfileForm } from "./link-forms";
import { ShareTools } from "./share-tools";

export const metadata: Metadata = { title: "Booking link" };

export default function BookingLinkPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <BookingLink />
    </Suspense>
  );
}

async function BookingLink() {
  const { business, canManage } = await requireBusinessContext(routes.bookingLink);
  if (!canManage) return <ManagersOnly what="the booking page" />;

  const siteUrl = await getSiteUrl();
  const url = `${siteUrl}${businessPagePath(business.slug)}`;
  const brand = business.brand_color ?? "#1c3d70";
  // QR modules must stay dark enough to scan on white, even for pale brand colors.
  const qrColor = brandOnLight(brand);
  const supabase = await createClient();
  const [qrSvg, qrPng, { data: photos }] = await Promise.all([
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: qrColor, light: "#ffffff" } }),
    QRCode.toDataURL(url, { margin: 2, width: 1024, errorCorrectionLevel: "M", color: { dark: qrColor, light: "#ffffff" } }),
    supabase
      .from("business_photos")
      .select("id, storage_path, caption")
      .eq("business_id", business.id)
      .order("sort_order")
      .order("created_at")
      .order("id"),
  ]);

  return (
    <>
      <PageHeader
        title="Booking link"
        description="Make your page yours, then put the link everywhere customers find you."
        actions={<PublishToggle businessId={business.id} published={business.is_published} />}
      />

      {!business.is_published ? (
        <div className="mb-6 rounded-2xl border border-sun/60 bg-sun-soft px-5 py-4 text-sm">
          <strong>Bookings are paused.</strong> Your page tells visitors you&apos;re not taking new bookings right now.
        </div>
      ) : null}

      {/* minmax(0, …) and min-w-0 let the columns shrink below their content, so
          the embed snippet scrolls inside its box instead of widening the page. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <ShareTools
            url={url}
            displayUrl={`${siteConfig.bookingLinkPrefix}${business.slug}`}
            businessName={business.name}
            qrSvg={qrSvg}
            qrPng={qrPng}
            brandColor={brand}
          />
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardTitle>Your page</CardTitle>
            <ProfileForm
              businessId={business.id}
              values={{
                name: business.name,
                slug: business.slug,
                description: business.description ?? "",
                phone: business.phone ?? "",
                email: business.email ?? "",
                websiteUrl: business.website_url ?? "",
                brandColor: business.brand_color ?? "#1c3d70",
              }}
            />
          </Card>
          <Card>
            <CardTitle>Logo</CardTitle>
            <LogoForm businessId={business.id} logoUrl={publicAssetUrl(business.logo_path)} businessName={business.name} />
          </Card>
          <Card>
            <CardTitle>Cover photo</CardTitle>
            <CoverForm businessId={business.id} coverUrl={publicAssetUrl(business.cover_path)} brandColor={brand} />
          </Card>
          <Card>
            <CardTitle>Photos</CardTitle>
            <PhotosForm
              businessId={business.id}
              photos={(photos ?? []).map((photo) => ({ id: photo.id, url: publicAssetUrl(photo.storage_path) ?? "", caption: photo.caption }))}
            />
          </Card>
        </div>
      </div>
    </>
  );
}

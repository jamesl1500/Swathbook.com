import { loadBookingPage } from "@/libs/booking-page";
import { findTrade } from "@/libs/marketing/content";
import { ogSize, renderBusinessOgImage, renderOgImage } from "@/libs/og-image";
import { publicAssetUrl } from "@/libs/supabase/storage";

export const alt = "Book online";
export const size = ogSize;
export const contentType = "image/png";

/** Share card for a business's booking link, in the business's colors. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await loadBookingPage(slug);
  if (!page) return renderOgImage();
  const { business } = page;
  return renderBusinessOgImage({
    name: business.name,
    tradeName: findTrade(business.trade)?.name,
    slug: business.slug,
    brandColor: business.brand_color ?? "#1c3d70",
    logoUrl: publicAssetUrl(business.logo_path),
  });
}

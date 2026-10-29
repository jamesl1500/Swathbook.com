import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { siteConfig } from "@/libs/globals/site";
import { businessPagePath, routes } from "@/libs/routes";
import { createAdminClient, hasAdminClient } from "@/libs/supabase/admin";
import { publicAssetUrl } from "@/libs/supabase/storage";

const pages: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }> = [
  { path: routes.home, priority: 1, changeFrequency: "weekly" },
  { path: routes.features, priority: 0.9, changeFrequency: "monthly" },
  { path: routes.industries, priority: 0.9, changeFrequency: "monthly" },
  { path: routes.pricing, priority: 0.9, changeFrequency: "monthly" },
  { path: routes.about, priority: 0.6, changeFrequency: "yearly" },
  { path: routes.contact, priority: 0.5, changeFrequency: "yearly" },
  { path: routes.terms, priority: 0.2, changeFrequency: "yearly" },
  { path: routes.privacy, priority: 0.2, changeFrequency: "yearly" },
];

/** A sitemap file holds at most 50,000 URLs. */
const MAX_BUSINESS_PAGES = 49_000;

/**
 * Live booking pages (published and set up). Listing businesses needs the
 * service role, since visitors can only read one page by its slug.
 */
async function businessPages(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");
  if (!hasAdminClient()) return [];

  const { data, error } = await createAdminClient()
    .from("businesses")
    .select("slug, updated_at, cover_path, trial_ends_at, business_photos(storage_path, sort_order), subscriptions(status)")
    .eq("is_published", true)
    .not("onboarding_completed_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(MAX_BUSINESS_PAGES);
  if (error) {
    console.error("[sitemap] couldn't list business pages", error);
    return [];
  }
  const now = Date.now();
  // Same rule as private.business_has_access(): paused pages stay out of the sitemap.
  const live = data.filter(
    (business) =>
      (business.trial_ends_at && Date.parse(business.trial_ends_at) > now) ||
      business.subscriptions.some((subscription) => ["trialing", "active", "past_due"].includes(subscription.status)),
  );
  return live.map((business) => {
    // Cover and gallery photos as image entries, so work photos can show up in image search.
    const images = [
      business.cover_path,
      ...[...business.business_photos].sort((a, b) => a.sort_order - b.sort_order).map((photo) => photo.storage_path),
    ]
      .map((path) => publicAssetUrl(path))
      .filter((url): url is string => Boolean(url))
      .slice(0, 10);
    return {
      url: `${siteConfig.url}${businessPagePath(business.slug)}`,
      lastModified: business.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      ...(images.length ? { images } : {}),
    };
  });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketing = pages.map(({ path, priority, changeFrequency }) => ({
    url: `${siteConfig.url}${path === "/" ? "" : path}`,
    changeFrequency,
    priority,
  }));
  return [...marketing, ...(await businessPages())];
}

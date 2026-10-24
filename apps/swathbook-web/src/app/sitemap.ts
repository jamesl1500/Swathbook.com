import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { siteConfig } from "@/libs/globals/site";
import { businessPagePath, routes } from "@/libs/routes";
import { createAdminClient, hasAdminClient } from "@/libs/supabase/admin";

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
    .select("slug, updated_at")
    .eq("is_published", true)
    .not("onboarding_completed_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(MAX_BUSINESS_PAGES);
  if (error) {
    console.error("[sitemap] couldn't list business pages", error);
    return [];
  }
  return data.map((business) => ({
    url: `${siteConfig.url}${businessPagePath(business.slug)}`,
    lastModified: business.updated_at,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const marketing = pages.map(({ path, priority, changeFrequency }) => ({
    url: `${siteConfig.url}${path === "/" ? "" : path}`,
    changeFrequency,
    priority,
  }));
  return [...marketing, ...(await businessPages())];
}

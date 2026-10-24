import type { MetadataRoute } from "next";
import { siteConfig } from "@/libs/globals/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Auth, onboarding and dashboard stay crawlable on purpose: they carry
      // `noindex`, and crawlers can only honor that if they're allowed to fetch the page.
      disallow: ["/api/"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}

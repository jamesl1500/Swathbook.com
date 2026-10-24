import type { Metadata } from "next";
import { pageMetadata } from "@/libs/seo";
import { routes } from "@/libs/routes";
import { LegalPage } from "@/components/marketing/legal-page";
import { siteConfig } from "@/libs/globals/site";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "What information Swathbook collects, how we use it, and how we protect your business and your customers' data.",
  path: routes.privacy,
});

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="TBD"
      intro={
        <p>
          This policy explains what information {siteConfig.legalName} collects when you use {siteConfig.name}, and how
          we use it.
        </p>
      }
      sections={[
        { title: "What we collect", body: <p>Account details you give us, your business and service information, and the bookings your customers make.</p> },
        { title: "How we use it", body: <p>To run your booking page, process payments, plan routes, and send the notifications you&apos;ve turned on.</p> },
        { title: "Your customers' data", body: <p>Customer details belong to you. We only use them to provide the service, and you can export or delete them.</p> },
        { title: "Contact", body: <p>Questions? Email {siteConfig.supportEmail}.</p> },
      ]}
    />
  );
}

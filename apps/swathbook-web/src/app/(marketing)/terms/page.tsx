import type { Metadata } from "next";
import { pageMetadata } from "@/libs/seo";
import { routes } from "@/libs/routes";
import { LegalPage } from "@/components/marketing/legal-page";
import { siteConfig } from "@/libs/globals/site";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "The terms that govern your use of Swathbook, the booking, payments and routing platform for field service businesses.",
  path: routes.terms,
});

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="TBD"
      intro={
        <p>
          These terms govern your use of {siteConfig.name}, operated by {siteConfig.legalName}. By creating an account you
          agree to them.
        </p>
      }
      sections={[
        { title: "Your account", body: <p>You&apos;re responsible for the information on your booking page and for the services you provide to your customers.</p> },
        { title: "Payments", body: <p>Deposits and payments are processed by our payment partner and are subject to their terms.</p> },
        { title: "Cancellation", body: <p>You can cancel at any time. Your booking link stops accepting new bookings at the end of the billing period.</p> },
        { title: "Contact", body: <p>Questions? Email {siteConfig.supportEmail}.</p> },
      ]}
    />
  );
}

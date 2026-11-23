import type { Metadata } from "next";
import { pageMetadata } from "@/libs/seo";
import { routes } from "@/libs/routes";
import { LegalContact, LegalLink, LegalList, LegalPage } from "@/components/marketing/legal-page";
import { siteConfig } from "@/libs/globals/site";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "What information Swathbook collects, how we use it, and how we protect your business and your customers' data.",
  path: routes.privacy,
});

const { legalName, name, supportEmail } = siteConfig;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="November 23, 2026"
      intro={
        <p>
          This policy explains how {legalName} (&ldquo;{name},&rdquo; &ldquo;we&rdquo; or &ldquo;us&rdquo;),{" "}
          {siteConfig.legalAddress.street}, {siteConfig.legalAddress.cityStateZip}, collects, uses and shares personal
          information when you use our website, booking pages, mobile apps and related services.
        </p>
      }
      sections={[
        {
          title: "Information we collect",
          body: (
            <>
              <p>Depending on how you use {name}, we collect:</p>
              <LegalList
                items={[
                  "Account details: your name, email, phone number, password (stored in hashed form), profile photo and saved home address.",
                  "Business details: business name, booking link, trade, phone, starting address, service area, hours, services, prices, photos, team members and invitations.",
                  "Booking details: customer names, emails, phones and service addresses, access notes, property and pet notes, answers to service questions, measured areas, appointment history, job notes, photos and reports.",
                  "Payment details: amounts, status, refunds, tips, and card brand and last four digits. Stripe collects full card numbers and the identity and bank details needed for payouts. We do not store them.",
                  "Messages: feedback you send us, emails you exchange with us, and details you submit through our investor interest form.",
                  "Device and usage details: IP address, browser or device type, app version, pages viewed and cookies. We use a hashed version of IP addresses for short-term rate limiting to prevent abuse.",
                ]}
              />
            </>
          ),
        },
        {
          title: "How we use information",
          body: (
            <>
              <p>We use personal information to:</p>
              <LegalList
                items={[
                  "provide booking pages, scheduling, payments, routes, quotes, job reports and customer records;",
                  "send booking confirmations, deposit and appointment reminders, receipts, reports, account and service messages;",
                  "process plans, fees, payouts and refunds through Stripe;",
                  "provide support and respond to feedback and inquiries;",
                  "understand how our marketing pages are used and improve the Service;",
                  "keep the Service secure and prevent fraud, abuse and spam; and",
                  "meet legal, tax and accounting obligations and enforce our terms.",
                ]}
              />
            </>
          ),
        },
        {
          title: "Businesses and their customers",
          body: (
            <>
              <p>
                When you book a Business through {name}, that Business receives your booking details and decides how it
                uses them. We process that information on the Business&apos;s behalf to provide the Service. The
                Business&apos;s own privacy practices apply to what it does with your information.
              </p>
              <p>
                If you want a Business&apos;s records about you changed or deleted, please contact that Business first. If
                you cannot reach it, email us and we will help where we can.
              </p>
            </>
          ),
        },
        {
          title: "How we share information",
          body: (
            <>
              <p>We share personal information only as needed:</p>
              <LegalList
                items={[
                  "With the Business you book and the team members assigned to your job.",
                  "Publicly, for the details a Business publishes on its booking page or in our directory. A Business's starting address is not shown to customers.",
                  "With service providers that run parts of the Service: Supabase (database, sign-in and file storage), Stripe (payments and payouts), Google (maps, address lookup, routes, satellite imagery, weather and analytics), Resend (email delivery), and our hosting providers.",
                  "When required by law, or to protect the rights, safety and security of people or the Service.",
                  "As part of a merger, financing, sale or reorganization, subject to this policy's protections.",
                  "With your direction or consent.",
                ]}
              />
              <p>
                <strong className="text-ink">
                  We do not sell personal information, and we do not share it for cross-context behavioral advertising.
                </strong>
              </p>
            </>
          ),
        },
        {
          title: "Payments and Stripe",
          body: (
            <p>
              Stripe processes payments and handles payout onboarding. When you provide personal data in connection with
              Stripe onboarding or a payment, Stripe receives that personal data and processes it in accordance with{" "}
              <LegalLink href="https://stripe.com/privacy">Stripe&apos;s Privacy Policy</LegalLink>.
            </p>
          ),
        },
        {
          title: "Google Maps",
          body: (
            <p>
              Address search, map, route, satellite and weather features use Google Maps Platform, so the addresses and
              locations involved are sent to Google. Google handles that information under the{" "}
              <LegalLink href="https://policies.google.com/privacy">Google Privacy Policy</LegalLink>.
            </p>
          ),
        },
        {
          title: "Cookies and analytics",
          body: (
            <>
              <p>
                We use essential cookies to keep you signed in, remember which business you have open and keep the Service
                secure.
              </p>
              <p>
                Our public marketing pages use Google Analytics through Google Tag Manager to measure visits and how people
                find and use the site. Google may set cookies and collect information such as your IP address, device,
                pages viewed and referring site. We do not load this tag on booking, invitation, sign-in or dashboard
                pages. You can read{" "}
                <LegalLink href="https://www.google.com/policies/privacy/partners/">how Google uses data from sites that use its services</LegalLink>{" "}
                and install the{" "}
                <LegalLink href="https://tools.google.com/dlpage/gaoptout">Google Analytics opt-out add-on</LegalLink>. You
                can also block or delete cookies in your browser, though essential features may stop working.
              </p>
            </>
          ),
        },
        {
          title: "Mobile apps",
          body: (
            <p>
              Our apps use your account to show your schedule, bookings and details. The customer app asks for access to
              your photos only if you choose a profile picture. You can change app permissions at any time in your device
              settings.
            </p>
          ),
        },
        {
          title: "How long we keep information",
          body: (
            <>
              <p>
                We keep personal information while your account is active and as needed to provide the Service, resolve
                disputes and meet legal, tax and accounting obligations.
              </p>
              <LegalList
                items={[
                  "Deleting a Business owner's account deletes the Businesses they own and their records, including customers, bookings, payment records and files. Upcoming jobs must be finished or cancelled first.",
                  "Deleting a customer login removes the login, saved details and profile photo. Bookings stay with the Business, because they are that Business's records.",
                  "A Business can delete a customer who has no bookings or payments. Records tied to bookings or payments are kept for the Business's history.",
                  "Feedback may be kept without being linked to your account. Stripe keeps its own payment records. Copies in backups and logs can remain for a limited time before they are overwritten.",
                ]}
              />
            </>
          ),
        },
        {
          title: "Security",
          body: (
            <p>
              We use safeguards such as encrypted connections, hashed passwords, access controls that separate each
              Business&apos;s data, and rate limits. No system is perfectly secure, so please use a strong, unique password
              and tell us right away at {supportEmail} if you suspect a problem.
            </p>
          ),
        },
        {
          title: "Your choices and rights",
          body: (
            <>
              <p>
                You can update your details in your account and delete your account from your account settings. Depending
                on where you live, including California and other US states with privacy laws, you may have the right to:
              </p>
              <LegalList
                items={[
                  "know what personal information we collect, use and disclose;",
                  "access, correct or delete your personal information;",
                  "receive a portable copy of it;",
                  "opt out of sale, sharing for targeted advertising, or certain profiling (we do not do these); and",
                  "appeal our decision and not be discriminated against for using your rights.",
                ]}
              />
              <p>
                To make a request, email {supportEmail}. We may need to verify your identity, and an authorized agent may
                act for you with proof of permission. If we hold your information on behalf of a Business, we may direct
                your request to that Business.
              </p>
            </>
          ),
        },
        {
          title: "Children",
          body: (
            <p>
              {name} is not directed to children under 13, and accounts are for people 18 and older. We do not knowingly
              collect personal information from children under 13. If you believe a child has given us information, contact
              us and we will delete it.
            </p>
          ),
        },
        {
          title: "Where information is processed",
          body: (
            <p>
              {legalName} is based in the United States. Your information may be processed in the United States and other
              countries where our service providers operate, whose privacy laws may differ from those where you live.
            </p>
          ),
        },
        {
          title: "Changes to this policy",
          body: (
            <p>
              We may update this policy as the Service changes. We will post the new version here and update the date above.
              For material changes, we will give notice by email or in the Service. Our{" "}
              <a href={routes.terms} className="font-semibold text-brand-600 underline underline-offset-4 hover:text-brand-700">
                Terms of Service
              </a>{" "}
              also apply to your use of {name}.
            </p>
          ),
        },
        {
          title: "Contact",
          body: (
            <>
              <p>Questions or privacy requests can be sent to:</p>
              <LegalContact />
            </>
          ),
        },
      ]}
    />
  );
}

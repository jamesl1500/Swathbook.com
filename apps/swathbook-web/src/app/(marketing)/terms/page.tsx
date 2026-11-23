import type { Metadata } from "next";
import { pageMetadata } from "@/libs/seo";
import { routes } from "@/libs/routes";
import { LegalContact, LegalLink, LegalList, LegalPage } from "@/components/marketing/legal-page";
import { CARD_PROCESSING, SWATHBOOK_FEE_LABEL } from "@/libs/billing/fees";
import { PLANS, TRIAL_DAYS } from "@/libs/billing/plans";
import { siteConfig } from "@/libs/globals/site";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "The terms that govern your use of Swathbook, the booking, payments and routing platform for field service businesses.",
  path: routes.terms,
});

const { legalName, name } = siteConfig;
const dollars = (cents: number) => `$${cents / 100}`;

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="November 23, 2026"
      intro={
        <p>
          These Terms of Service are an agreement between you and {legalName} (&ldquo;{name},&rdquo; &ldquo;we&rdquo; or
          &ldquo;us&rdquo;), {siteConfig.legalAddress.street}, {siteConfig.legalAddress.cityStateZip}. They apply when you
          use our website, booking pages, mobile apps and related services (the &ldquo;Service&rdquo;). By creating an
          account, booking through the Service or otherwise using it, you agree to these terms.
        </p>
      }
      sections={[
        {
          title: "The Service",
          body: (
            <>
              <p>
                {name} is software for businesses that travel to their customers. It provides booking pages, scheduling,
                deposits and payments, route planning, customer records, job reports and related tools. In these terms, a
                &ldquo;Business&rdquo; is a company or person using {name} to run a service business, including its owners
                and team members. A &ldquo;Customer&rdquo; is someone who books or pays a Business through the Service.
              </p>
              <p>
                {name} is a software provider only. We are not a party to any agreement between a Business and a Customer.
                We do not employ, supervise, endorse or insure Businesses, and we do not perform, inspect or guarantee
                their work.
              </p>
            </>
          ),
        },
        {
          title: "Accounts and eligibility",
          body: (
            <>
              <p>
                You must be at least 18 and able to form a binding contract to create an account. Keep your information
                accurate and your password secure. You are responsible for activity under your login.
              </p>
              <p>
                If you create a Business, you confirm that you have authority to act for it. The Business owner is
                responsible for the people they invite and the access they give them. One login can run up to 25
                Businesses, and each Business has its own booking link, trial, plan and Stripe account.
              </p>
            </>
          ),
        },
        {
          title: "Business responsibilities",
          body: (
            <>
              <p>If you use {name} to run a Business, you are responsible for:</p>
              <LegalList
                items={[
                  "the services you provide, their quality and safety, and your dealings with Customers;",
                  "holding any licenses, permits and insurance your work requires;",
                  "the accuracy of your prices, deposits, service area, availability, photos and other page content;",
                  "publishing and honoring fair cancellation, refund and deposit policies;",
                  "your taxes, including any sales tax on your services;",
                  "complying with the laws that apply to your business, including consumer protection, privacy and employment laws; and",
                  "handling Customer information lawfully and only for the purpose of serving those Customers.",
                ]}
              />
            </>
          ),
        },
        {
          title: "Booking as a customer",
          body: (
            <>
              <p>
                When you book through {name}, your agreement for the work is with the Business. The Business sets its
                prices, deposits, availability, and cancellation and refund policies, and those policies apply to your
                booking. Deposits and payments go to the Business, and refund decisions are made by the Business.
              </p>
              <p>
                Please give accurate contact, address and property details, and only share access information you are
                allowed to share. Take any question or complaint about the work to the Business first. If you cannot
                resolve a problem with a card charge, your card issuer may also be able to help.
              </p>
            </>
          ),
        },
        {
          title: "Plans, free trial and billing",
          body: (
              <LegalList
                items={[
                  `Free trial. Each new Business gets a ${TRIAL_DAYS}-day free trial that starts when its setup is finished. No credit card is needed. If you do not choose a plan by the end of the trial, the booking page pauses and you are not charged.`,
                  `Plans. ${PLANS.solo.name} is ${dollars(PLANS.solo.priceCents)} per month for ${PLANS.solo.seats} person. ${PLANS.crew.name} is ${dollars(PLANS.crew.priceCents)} per month for up to ${PLANS.crew.seats} team members, including the owner. Fleet plans are priced by agreement. Prices are in US dollars and do not include any taxes that apply. Each Business needs its own plan.`,
                  "Automatic renewal. Paid plans renew every month and are charged to your payment method until you cancel. By choosing a plan, you authorize these recurring charges. If you subscribe during a trial, your first charge happens when the trial ends.",
                  "Cancellation. You can cancel any time from your billing page. Your plan stays active until the end of the period you have paid for, then your booking link stops accepting new bookings.",
                  "Refunds. Plan fees already paid are not refundable, including for partial months, except where the law requires a refund.",
                  "Failed payments. If a payment fails, we or Stripe may retry it. If it stays unpaid, your booking page may be paused until the balance is paid.",
                  "Price changes. We will give you at least 30 days' notice by email before changing what you pay. If you do not agree, you can cancel before the change takes effect.",
                ]}
              />
          ),
        },
        {
          title: "Swathbook payment fee",
          body: (
            <>
              <p>
                In addition to your plan, {name} charges {SWATHBOOK_FEE_LABEL} of each deposit and balance a Customer pays
                through the Service. The fee is deducted when the payment is made, before the money reaches your Stripe
                balance. There is no {name} fee on tips or on payments you collect outside the Service, such as cash.
              </p>
              <p>
                When a payment is refunded through {name}, our fee on the refunded amount is returned. Card processing
                fees are separate and are charged by Stripe under its pricing, currently {CARD_PROCESSING.label} on most US
                cards. We will give you at least 30 days&apos; notice by email before changing our fee.
              </p>
            </>
          ),
        },
        {
          title: "Payment processing by Stripe",
          body: (
            <>
              <p>
                Payment processing services for Businesses on {name} are provided by Stripe and are subject to the{" "}
                <LegalLink href="https://stripe.com/connect-account/legal/full">Stripe Connected Account Agreement</LegalLink>
                , which includes the <LegalLink href="https://stripe.com/legal/ssa">Stripe Terms of Service</LegalLink>{" "}
                (collectively, the &ldquo;Stripe Services Agreement&rdquo;). By agreeing to these terms or continuing to
                operate as a Business on {name}, you agree to be bound by the Stripe Services Agreement, as the same might
                be modified by Stripe from time to time. As a condition of {name} enabling payment processing services
                through Stripe, you agree to provide {name} accurate and complete information about you and your business,
                and you authorize {name} to share it and transaction information related to your use of the payment
                processing services provided by Stripe.
              </p>
              <p>
                Each Business connects its own Stripe account. {name} records which Business the account belongs to and
                who created it. {name} does not hold your funds, and Stripe sets payout timing. As between you and {name},
                the Business is responsible for refunds, disputes and chargebacks on its payments. Stripe&apos;s banking
                partners are listed in its{" "}
                <LegalLink href="https://stripe.com/legal/acquirer-disclosure">acquirer disclosure</LegalLink>.
              </p>
            </>
          ),
        },
        {
          title: "Maps, routes, quotes and forecasts",
          body: (
            <>
              <p>
                Routes, drive times, satellite measurements, price estimates and weather forecasts are estimates and can
                be wrong. Check them before relying on them. Always follow traffic laws and road conditions, and do not
                use the Service in a way that distracts you while driving.
              </p>
              <p>
                Parts of the Service use Google Maps. By using those features, you agree to the{" "}
                <LegalLink href="https://maps.google.com/help/terms_maps/">Google Maps End User Additional Terms of Service</LegalLink>{" "}
                and acknowledge the <LegalLink href="https://policies.google.com/privacy">Google Privacy Policy</LegalLink>.
              </p>
            </>
          ),
        },
        {
          title: "Your content",
          body: (
            <p>
              You keep ownership of the content you add, such as photos, descriptions, notes and customer records. You
              give {name} a non-exclusive, worldwide, royalty-free license to host, copy, process and display it as needed
              to run, secure and improve the Service. That includes showing a published Business page publicly, in our
              directory and in search engines. You confirm that you have the rights and permissions needed to share your
              content, including photos of a Customer&apos;s property.
            </p>
          ),
        },
        {
          title: "Acceptable use",
          body: (
            <>
              <p>You agree not to:</p>
              <LegalList
                items={[
                  "break the law, infringe anyone's rights, or impersonate a person or business;",
                  "post false, misleading, harmful or abusive content;",
                  "use the Service for illegal, fraudulent or prohibited goods, services or transactions;",
                  "send spam or contact people without a lawful basis;",
                  "access another person's account or data, or probe or bypass our security or limits;",
                  "scrape, overload or disrupt the Service, or introduce malicious code; or",
                  "copy, resell or reverse engineer the Service, except where the law allows it.",
                ]}
              />
            </>
          ),
        },
        {
          title: "Our intellectual property",
          body: (
            <p>
              {name}, including its software, design, logos and content, belongs to {legalName} and its licensors. We give
              you a limited, revocable, non-transferable right to use the Service under these terms. If you send us ideas
              or feedback, we may use them without restriction or payment to you.
            </p>
          ),
        },
        {
          title: "Other companies' services",
          body: (
            <p>
              The Service relies on and links to services run by other companies, including Stripe and Google. Their terms
              and policies apply to your use of those services, and we are not responsible for their availability or
              conduct.
            </p>
          ),
        },
        {
          title: "Suspension and closing your account",
          body: (
            <>
              <p>
                You can delete your account from your account settings. A Business owner must finish or cancel upcoming
                jobs first. Deleting an owner&apos;s account deletes the Businesses they own, as described in our{" "}
                <a href={routes.privacy} className="font-semibold text-brand-600 underline underline-offset-4 hover:text-brand-700">
                  Privacy Policy
                </a>
                .
              </p>
              <p>
                We may suspend or end access if you breach these terms, create risk or possible legal exposure, fail to
                pay, or if the law requires it. Where reasonable, we will tell you first. Sections that by their nature
                should continue, including those on fees owed, disclaimers, liability, indemnity and disputes, survive
                after your account ends.
              </p>
            </>
          ),
        },
        {
          title: "Disclaimers",
          body: (
            <p>
              <strong className="text-ink">
                To the fullest extent the law allows, the Service is provided &ldquo;as is&rdquo; and &ldquo;as
                available.&rdquo; We disclaim all warranties, express or implied, including merchantability, fitness for a
                particular purpose, title and non-infringement. We do not promise that the Service will be uninterrupted,
                error-free or secure, or that any estimate, route, booking or Business will meet your expectations.
              </strong>
            </p>
          ),
        },
        {
          title: "Limitation of liability",
          body: (
            <>
              <p>
                <strong className="text-ink">
                  To the fullest extent the law allows, {legalName} and its owners, employees and agents will not be liable
                  for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, data
                  or goodwill. Our total liability for all claims relating to the Service will not exceed the greater of
                  $100 or the amount you paid {name} in the 12 months before the claim arose.
                </strong>
              </p>
              <p>
                We are not liable for the acts, omissions, work or property damage of any Business or Customer. Nothing in
                these terms limits liability that cannot legally be limited.
              </p>
            </>
          ),
        },
        {
          title: "Indemnity",
          body: (
            <p>
              If you use {name} as a Business, you will defend and hold harmless {legalName} and its owners, employees and
              agents from third-party claims, losses and reasonable legal fees arising from your services, your content,
              your dealings with Customers, or your breach of these terms or the law.
            </p>
          ),
        },
        {
          title: "Governing law and disputes",
          body: (
            <>
              <p>
                Ohio law governs these terms, without regard to its conflict-of-law rules. Before filing a claim, please
                email us and give us 30 days to try to resolve it informally.
              </p>
              <p>
                Any lawsuit must be brought in the state courts located in Lorain County, Ohio, or the United States
                District Court for the Northern District of Ohio, and you and {name} consent to those courts. Either of us
                may bring a qualifying claim in small claims court. If you are a consumer, this section does not remove any
                right you have under the law of your home state to bring a claim there.
              </p>
            </>
          ),
        },
        {
          title: "Changes to these terms",
          body: (
            <p>
              We may update these terms as the Service changes. We will post the new version here and update the date
              above. For material changes, we will give at least 30 days&apos; notice by email or in the Service. Continuing
              to use the Service after the changes take effect means you accept them.
            </p>
          ),
        },
        {
          title: "General",
          body: (
            <p>
              These terms and the policies they mention are the whole agreement between you and {name} about the Service.
              If part of them cannot be enforced, the rest still applies. Not enforcing a term is not a waiver of it. You
              may not transfer these terms without our consent. We may transfer them as part of a merger, sale or
              reorganization. We are not responsible for delays caused by events beyond our reasonable control.
            </p>
          ),
        },
        {
          title: "Contact",
          body: (
            <>
              <p>Questions or legal notices can be sent to:</p>
              <LegalContact />
            </>
          ),
        },
      ]}
    />
  );
}

import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { siteConfig } from "@/libs/globals/site";
import { trades } from "@/libs/marketing/content";
import { routes } from "@/libs/routes";

const columns = [
  {
    title: "Product",
    links: [
      { href: routes.features, label: "Features" },
      { href: routes.pricing, label: "Pricing" },
      { href: routes.signup, label: "Get your link" },
      { href: routes.login, label: "Log in" },
    ],
  },
  {
    title: "Trades",
    links: [
      ...trades.slice(0, 5).map((trade) => ({ href: `${routes.industries}#${trade.id}`, label: trade.name })),
      { href: routes.industries, label: "All trades" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: routes.about, label: "About" },
      { href: routes.contact, label: "Contact" },
      { href: routes.terms, label: "Terms of service" },
      { href: routes.privacy, label: "Privacy policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-ink text-paper">
      <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
          <div className="max-w-sm">
            <Logo tone="paper" />
            <p className="mt-4 leading-relaxed text-paper/80">
              Booking, deposits, payments and AI-planned routes for every trade that drives to its customers:
              detailers, cleaners, landscapers, plumbers and more.
            </p>
            <Link
              href={routes.signup}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-sun px-5 text-sm font-semibold text-ink transition-colors hover:bg-[#f2621a]"
            >
              Claim your free link
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="mt-5 flex items-center gap-2 text-sm text-paper/80 hover:text-paper"
            >
              <Mail className="size-4 text-sky" aria-hidden="true" />
              {siteConfig.supportEmail}
            </a>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
            {columns.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <p className="label-tag text-sky">{column.title}</p>
                <ul className="mt-4 space-y-1">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link href={link.href} className="inline-flex min-h-9 items-center text-sm text-paper/85 transition-colors hover:text-sun">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-2 border-t border-paper/15 pt-6 text-sm text-paper/75 sm:flex-row sm:items-center sm:justify-between">
          <p>© {siteConfig.legalName}. All rights reserved.</p>
          <p>Made for the trades that come to you.</p>
        </div>
      </div>
    </footer>
  );
}

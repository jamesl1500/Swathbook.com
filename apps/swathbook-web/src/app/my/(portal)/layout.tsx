import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarCheck, CircleUser, LogOut, MessageSquareHeart, Search } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { siteConfig } from "@/libs/globals/site";
import { routes } from "@/libs/routes";
import { signOutCustomer } from "../actions";

const navItem =
  "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink sm:px-3.5";

const nav = [
  { href: routes.customerJobs, label: "My jobs", icon: CalendarCheck },
  { href: routes.findBusinesses, label: "Find a pro", icon: Search },
  { href: routes.customerProfile, label: "Profile", icon: CircleUser },
  { href: routes.customerFeedback, label: "Feedback", icon: MessageSquareHeart },
];

/** Chrome for the signed-in customer pages. The proxy already sent signed-out visitors to sign in. */
export default function CustomerPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-2 px-4 sm:px-6">
          <Logo href={routes.customerJobs} className="shrink-0" wordmarkClassName="hidden sm:inline" />
          <nav aria-label="Your account" className="flex items-center gap-0.5">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={navItem}>
                <Icon className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </Link>
            ))}
            <form action={signOutCustomer}>
              <button type="submit" className={navItem}>
                <LogOut className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
                <span className="sr-only sm:hidden">Sign out</span>
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-4xl flex-wrap justify-between gap-3 px-4 py-6 text-sm text-ink-soft sm:px-6">
          <p>© {siteConfig.legalName}</p>
          <div className="flex gap-5">
            <Link href={routes.contact} className="hover:text-ink">
              Help
            </Link>
            <Link href={routes.privacy} className="hover:text-ink">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

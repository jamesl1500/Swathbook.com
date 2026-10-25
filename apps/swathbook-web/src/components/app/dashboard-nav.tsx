"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  CalendarDays,
  CircleHelp,
  CircleUser,
  CreditCard,
  House,
  Link2,
  ListChecks,
  LogOut,
  Menu,
  Plus,
  Route,
  Users,
  UsersRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { routes } from "@/libs/routes";
import { cn } from "@/libs/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; managersOnly?: boolean };

const items: NavItem[] = [
  { href: routes.dashboard, label: "Overview", icon: House },
  { href: routes.schedule, label: "Schedule", icon: CalendarDays },
  { href: routes.customers, label: "Customers", icon: Users },
  { href: routes.dayRoutes, label: "Routes", icon: Route },
  { href: routes.services, label: "Services", icon: ListChecks, managersOnly: true },
  { href: routes.bookingLink, label: "Booking link", icon: Link2, managersOnly: true },
  { href: routes.payouts, label: "Payouts", icon: Wallet, managersOnly: true },
  { href: routes.team, label: "Team", icon: UsersRound, managersOnly: true },
  { href: routes.billing, label: "Billing", icon: CreditCard, managersOnly: true },
];

function isActive(pathname: string, href: string) {
  return href === routes.dashboard ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav({ canManage, variant }: { canManage: boolean; variant: "sidebar" | "tabbar" }) {
  const pathname = usePathname();
  const visible = items.filter((item) => canManage || !item.managersOnly);

  if (variant === "tabbar") return <TabBar canManage={canManage} pathname={pathname} />;

  return (
    <nav aria-label="Dashboard">
      <ul className="space-y-1">
        {visible.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.95rem] font-semibold transition-colors",
                  active ? "bg-brand-600 text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink",
                )}
              >
                <Icon className="size-[1.1rem]" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Phone navigation: the four places a crew lives in all day, a big "new job"
 * button for owners, and everything else one tap away under More.
 */
function TabBar({ canManage, pathname }: { canManage: boolean; pathname: string }) {
  const sheetRef = useRef<HTMLDialogElement>(null);
  const primary = canManage
    ? [items[0], items[1], null, items[3]]
    : [items[0], items[1], items[2], items[3]];
  const moreItems = items.filter((item) => !primary.includes(item) && (canManage || !item.managersOnly));
  const moreActive = moreItems.some((item) => isActive(pathname, item.href)) || pathname.startsWith(routes.account);

  // Close the sheet whenever navigation happens.
  useEffect(() => {
    sheetRef.current?.close();
  }, [pathname]);

  return (
    <>
      <nav
        aria-label="Dashboard"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {primary.map((item) =>
            item ? (
              <li key={item.href}>
                <TabLink item={item} active={isActive(pathname, item.href)} />
              </li>
            ) : (
              <li key="new-job" className="flex items-start justify-center">
                <Link
                  href={routes.newBooking}
                  className="-mt-5 grid size-14 place-items-center rounded-full bg-sun text-ink shadow-lift ring-4 ring-paper transition-transform active:scale-95"
                >
                  <Plus className="size-6" strokeWidth={2.5} aria-hidden="true" />
                  <span className="sr-only">New job</span>
                </Link>
              </li>
            ),
          )}
          <li>
            <button
              type="button"
              onClick={() => sheetRef.current?.showModal()}
              aria-haspopup="dialog"
              className={cn(
                "flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold",
                moreActive ? "text-brand-600" : "text-ink-soft",
              )}
            >
              <Menu className="size-5" aria-hidden="true" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={sheetRef}
        aria-label="More"
        onClick={(event) => {
          // A tap on the backdrop (the dialog element itself) closes the sheet.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none rounded-t-[1.75rem] border-t border-line bg-card p-0 text-ink shadow-lift backdrop:bg-ink/40 lg:hidden"
      >
        <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="mx-auto h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
          </div>
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="font-display text-lg font-bold">More</p>
            <button
              type="button"
              onClick={() => sheetRef.current?.close()}
              className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-paper-deep"
            >
              <X className="size-5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          <ul className="space-y-1">
            {[...moreItems, { href: routes.account, label: "Account settings", icon: CircleUser }, { href: routes.contact, label: "Help & contact", icon: CircleHelp }].map(
              ({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive(pathname, href) ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold",
                      isActive(pathname, href) ? "bg-brand-600 text-paper" : "text-ink hover:bg-paper-deep",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              ),
            )}
            <li className="border-t border-line pt-1">
              <form action={signOut}>
                <button type="submit" className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-base font-semibold text-ink hover:bg-paper-deep">
                  <LogOut className="size-5" aria-hidden="true" />
                  Log out
                </button>
              </form>
            </li>
          </ul>
        </div>
      </dialog>
    </>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold transition-colors",
        active ? "text-brand-600" : "text-ink-soft hover:text-ink",
      )}
    >
      {active ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand-600" aria-hidden="true" /> : null}
      <Icon className="size-5" aria-hidden="true" />
      {item.label === "Overview" ? "Home" : item.label}
    </Link>
  );
}

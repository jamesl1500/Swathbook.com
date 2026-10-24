import type { ReactNode } from "react";
import Link from "next/link";
import { CircleUser, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/app/auth/actions";
import { routes } from "@/libs/routes";
import { cn } from "@/libs/utils";

const headerAction =
  "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink";

/**
 * Top bar for signed-in screens (onboarding, dashboard). `children` renders
 * next to the logo, e.g. the business switcher.
 */
export function AppHeader({ children, compactOnMobile = false }: { children?: ReactNode; compactOnMobile?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <Logo href={routes.dashboard} className="shrink-0" wordmarkClassName={compactOnMobile ? "hidden sm:inline" : undefined} />
          {children}
        </div>
        {/* On phones the dashboard's tab bar "More" sheet holds these. */}
        <div className={cn("shrink-0 items-center gap-1", compactOnMobile ? "hidden lg:flex" : "flex")}>
          <Link href={routes.account} className={headerAction}>
            <CircleUser className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Account</span>
            <span className="sr-only sm:hidden">Account settings</span>
          </Link>
          <form action={signOut}>
            <button type="submit" className={headerAction}>
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Log out</span>
              <span className="sr-only sm:hidden">Log out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

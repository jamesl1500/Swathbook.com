import Link from "next/link";
import { routes } from "@/libs/routes";
import { Logo } from "@/components/brand/logo";
import { buttonStyles } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";
import { navLinks } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-[0.95rem] font-medium text-ink-soft transition-colors hover:bg-paper-deep hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href={routes.login} className={buttonStyles({ variant: "ghost", size: "sm" })}>
            Log in
          </Link>
          <Link href={routes.signup} className={buttonStyles({ variant: "primary", size: "sm" })}>
            Get your link
          </Link>
        </div>

        <MobileNav />
      </div>
    </header>
  );
}

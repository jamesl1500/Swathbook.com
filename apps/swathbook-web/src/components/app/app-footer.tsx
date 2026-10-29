import Link from "next/link";
import { siteConfig } from "@/libs/globals/site";
import { routes } from "@/libs/routes";

const links = [
  { href: routes.account, label: "Account settings" },
  { href: routes.contact, label: "Help & contact" },
  { href: routes.terms, label: "Terms" },
  { href: routes.privacy, label: "Privacy" },
];

/** Quiet footer for signed-in screens (onboarding, dashboard). */
export function AppFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-ink-soft sm:px-6 md:flex-row md:items-center md:justify-between lg:px-10">
        <p>
          © {siteConfig.legalName} ·{" "}
          <a href={`mailto:${siteConfig.supportEmail}`} className="font-semibold hover:text-ink">
            {siteConfig.supportEmail}
          </a>
        </p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

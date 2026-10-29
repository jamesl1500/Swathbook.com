"use client";

import Link from "next/link";
import { routes } from "@/libs/routes";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { navLinks } from "./nav-links";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="grid size-10 place-items-center rounded-full text-ink hover:bg-paper-deep"
      >
        {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>

      {open ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-16 border-b border-line bg-paper px-4 pb-6 pt-2 shadow-card"
        >
          <nav aria-label="Mobile" className="flex flex-col">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className="border-b border-line/70 py-3.5 font-display text-lg font-semibold"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link href={routes.login} onClick={close} className={buttonStyles({ variant: "secondary" })}>
              Log in
            </Link>
            <Link href={routes.signup} onClick={close} className={buttonStyles({ variant: "primary" })}>
              Get your link
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

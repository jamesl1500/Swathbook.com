import type { Metadata } from "next";
import type { ReactNode } from "react";
import { noIndex } from "@/libs/seo";
import { AppFooter } from "@/components/app/app-footer";
import { AppHeader } from "@/components/app/app-header";

export const metadata: Metadata = { robots: noIndex };

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="flex-1">{children}</main>
      <AppFooter />
    </div>
  );
}

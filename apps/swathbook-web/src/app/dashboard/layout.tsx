import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { noIndex } from "@/libs/seo";
import { getActiveBusiness, getCurrentUser } from "@/libs/auth";
import { AppFooter } from "@/components/app/app-footer";
import { BillingBanner } from "@/components/app/billing-banner";
import { AppHeader } from "@/components/app/app-header";
import { BusinessSwitcher } from "@/components/app/business-switcher";
import { DashboardNav } from "@/components/app/dashboard-nav";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Swathbook" },
  robots: noIndex,
};

/** Nav needs the role, which is per-request, so it streams in. */
async function RoleAwareNav({ variant }: { variant: "sidebar" | "tabbar" }) {
  const user = await getCurrentUser();
  const role = user ? (await getActiveBusiness(user.id)).active?.role : undefined;
  return <DashboardNav canManage={role !== "crew"} variant={variant} />;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    // pb-tabbar keeps the last content (and the footer) clear of the phone tab bar.
    <div className="flex min-h-dvh flex-col pb-tabbar lg:pb-0">
      <AppHeader compactOnMobile>
        <Suspense fallback={<div className="h-9 w-40 animate-pulse rounded-full bg-paper-deep" />}>
          <BusinessSwitcher />
        </Suspense>
      </AppHeader>
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 border-r border-line px-4 py-8 lg:block">
          <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-paper-deep" />}>
            <RoleAwareNav variant="sidebar" />
          </Suspense>
        </aside>
        <div className="min-w-0 flex-1">
          <Suspense>
            <BillingBanner />
          </Suspense>
          <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</main>
        </div>
      </div>
      <AppFooter />
      <Suspense>
        <RoleAwareNav variant="tabbar" />
      </Suspense>
    </div>
  );
}

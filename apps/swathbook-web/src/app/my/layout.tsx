import type { Metadata } from "next";
import type { ReactNode } from "react";
import { noIndex } from "@/libs/seo";

/** The customer area: private to each customer, so never in search results. */
export const metadata: Metadata = {
  title: { default: "My bookings", template: "%s · Swathbook" },
  robots: noIndex,
};

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return children;
}

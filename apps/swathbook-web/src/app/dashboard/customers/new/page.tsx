import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, ManagersOnly, PageHeader } from "@/components/app/ui";
import { requireBusinessContext } from "@/libs/dashboard";
import { hasGoogleMaps } from "@/libs/google/maps";
import { routes } from "@/libs/routes";
import { NewCustomerForm } from "../customer-forms";

export const metadata: Metadata = { title: "Add customer" };

export default function NewCustomerPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <NewCustomer />
    </Suspense>
  );
}

async function NewCustomer() {
  const { business, canManage } = await requireBusinessContext(routes.newCustomer);
  if (!canManage) return <ManagersOnly what="customers" />;
  return (
    <>
      <PageHeader eyebrow="Customers" title="Add a customer" description="For people who call or text instead of booking online." />
      <Card className="max-w-2xl">
        <NewCustomerForm businessId={business.id} googleEnabled={hasGoogleMaps()} />
      </Card>
    </>
  );
}

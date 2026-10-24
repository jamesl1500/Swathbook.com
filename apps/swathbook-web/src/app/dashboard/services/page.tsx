import type { Metadata } from "next";
import { Suspense } from "react";
import { ListChecks } from "lucide-react";
import { EmptyState, ManagersOnly, PageHeader } from "@/components/app/ui";
import { requireBusinessContext } from "@/libs/dashboard";
import { findTrade } from "@/libs/marketing/content";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { ServiceEditor, ServiceList } from "./service-editor";

export const metadata: Metadata = { title: "Services" };

export default function ServicesPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <Services />
    </Suspense>
  );
}

async function Services() {
  const { business, canManage } = await requireBusinessContext(routes.services);
  if (!canManage) return <ManagersOnly what="services and prices" />;

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("business_id", business.id)
    .order("sort_order")
    .order("name");

  return (
    <>
      <PageHeader
        title="Services"
        description="What customers can book, what it costs, how long it takes, and whether you collect a deposit up front."
      />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          {services?.length ? (
            <ServiceList businessId={business.id} services={services} currency={business.currency} />
          ) : (
            <EmptyState icon={ListChecks} title="No services yet">
              Add your first service on the right. It shows up on your booking page right away.
            </EmptyState>
          )}
        </div>
        <aside>
          <div className="rounded-[1.5rem] border border-line bg-card p-5 sm:p-6 xl:sticky xl:top-28">
            <h2 className="text-lg font-bold">Add a service</h2>
            <p className="mt-1 text-sm text-ink-soft">Deposits are charged when a customer books and come off the final bill.</p>
            <div className="mt-5">
              <ServiceEditor businessId={business.id} namePlaceholder={`e.g. ${findTrade(business.trade)?.sampleServices[0]?.name ?? "Standard visit"}`} />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

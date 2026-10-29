import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, Plus, Search, Users } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/app/ui";
import { buttonStyles } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { requireBusinessContext } from "@/libs/dashboard";
import { customerPath, routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { formatDateTime } from "@/libs/time";
import { formatCents } from "@/libs/utils";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 25;

export default function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-[1.75rem] bg-paper-deep" />}>
      <Customers searchParams={searchParams} />
    </Suspense>
  );
}

async function Customers({ searchParams }: { searchParams: PageProps<"/dashboard/customers">["searchParams"] }) {
  const { business, canManage } = await requireBusinessContext(routes.customers);
  const { q, page } = await searchParams;
  const search = typeof q === "string" ? q.slice(0, 100) : "";
  const pageNumber = Math.max(1, Number(typeof page === "string" ? page : 1) || 1);

  const supabase = await createClient();
  const { data: customers } = await supabase.rpc("customer_list", {
    p_business_id: business.id,
    p_search: search || undefined,
    p_limit: PAGE_SIZE,
    p_offset: (pageNumber - 1) * PAGE_SIZE,
  });
  const total = customers?.[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (value: number) => `${routes.customers}?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(value) })}`;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who's booked you, with their addresses, notes and history."
        actions={
          canManage ? (
            <Link href={routes.newCustomer} className={buttonStyles({ size: "sm" })}>
              <Plus className="size-4" aria-hidden="true" />
              Add customer
            </Link>
          ) : null
        }
      />

      <Form action={routes.customers} className="mb-6 flex max-w-xl gap-2">
        <label htmlFor="customer-search" className="sr-only">
          Search customers
        </label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <Input id="customer-search" name="q" defaultValue={search} placeholder="Search by name, email or phone" className="pl-9" />
        </div>
        <button type="submit" className={buttonStyles({ variant: "secondary" })}>
          Search
        </button>
      </Form>

      {customers?.length ? (
        <>
          <div className="overflow-hidden rounded-[1.5rem] border border-line bg-card">
            <ul className="divide-y divide-line">
              {customers.map((customer) => (
                <li key={customer.id}>
                  <Link href={customerPath(customer.id)} className="flex items-center gap-4 px-5 py-4 hover:bg-paper/70" data-testid="customer-row">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 font-display font-bold text-brand-700">
                      {customer.full_name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{customer.full_name}</span>
                      <span className="block truncate text-sm text-ink-soft">{[customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact info"}</span>
                    </span>
                    <span className="hidden text-right text-sm sm:block">
                      <span className="block text-ink-soft">
                        {customer.next_booking_at
                          ? `Next: ${formatDateTime(customer.next_booking_at, business.timezone)}`
                          : customer.last_booking_at
                            ? `Last: ${formatDateTime(customer.last_booking_at, business.timezone)}`
                            : "No visits yet"}
                      </span>
                      <span className="block text-ink-faint">
                        {customer.booking_count} {customer.booking_count === 1 ? "booking" : "bookings"}
                        {canManage && customer.lifetime_paid_cents > 0 ? ` · ${formatCents(customer.lifetime_paid_cents, business.currency)}` : ""}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {pages > 1 ? (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-ink-soft">
                {total} customers · page {pageNumber} of {pages}
              </span>
              <span className="flex gap-2">
                {pageNumber > 1 ? (
                  <Link href={pageHref(pageNumber - 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    Previous
                  </Link>
                ) : null}
                {pageNumber < pages ? (
                  <Link href={pageHref(pageNumber + 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                    Next
                  </Link>
                ) : null}
              </span>
            </nav>
          ) : null}
        </>
      ) : search ? (
        <EmptyState icon={Search} title={`No customers match "${search}"`}>
          Try part of a name, an email or a phone number.
        </EmptyState>
      ) : (
        <EmptyState
          icon={Users}
          title="No customers yet"
          action={
            canManage ? (
              <Link href={routes.newCustomer} className={buttonStyles({ size: "sm" })}>
                Add your first customer
              </Link>
            ) : null
          }
        >
          Customers appear here automatically when they book from your link. You can also add them yourself.
        </EmptyState>
      )}
    </>
  );
}

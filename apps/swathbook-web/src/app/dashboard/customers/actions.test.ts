// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectRedirect } from "@/test/next-mocks";
import { createSupabaseMock, type SupabaseMock } from "@/test/supabase-mock";

const BUSINESS_ID = "6f1f5c2e-0c4a-4b8e-9a59-1f2d3c4b5a69";

const state = vi.hoisted(() => ({
    supabase: null as unknown as SupabaseMock,
    auth: {} as Record<string, unknown>,
    geocode: vi.fn(),
}));

vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).mockRedirect }));
vi.mock("@/libs/google/maps", () => ({ hasGoogleMaps: () => true, geocodeAddress: state.geocode, placeDetails: vi.fn(async () => null) }));
vi.mock("@/libs/supabase/server", () => ({ createClient: vi.fn(async () => state.supabase.client) }));
vi.mock("@/libs/dashboard", () => ({
    authorizeBusiness: vi.fn(async () => state.auth),
    isFailure: (value: unknown) => typeof value === "object" && value !== null && "error" in value,
}));

import { createCustomer, deleteAddress, deleteCustomer, makePrimaryAddress, saveAddress, updateCustomer } from "./actions";

function form(fields: Record<string, string>) {
    const data = new FormData();
    data.set("businessId", BUSINESS_ID);
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
}

const customer = { fullName: "  Ada Lovelace ", email: " ADA@Example.com ", phone: "+1 (512) 555-0100", notes: "", tags: "VIP, weekly, vip,  ", emailOptIn: "on" };

beforeEach(() => {
    state.supabase = createSupabaseMock();
    state.auth = { user: { id: "u1" }, role: "owner", businessId: BUSINESS_ID };
    state.geocode.mockReset().mockResolvedValue({ lat: 30.27, lng: -97.74, placeId: "place_1", formatted: "1 Main St, Austin, TX" });
});

describe("createCustomer", () => {
    it("normalizes the details, saves a geocoded primary address, and opens the customer", async () => {
        state.supabase.respond("customers.insert", { data: { id: "c1" } });
        await expectRedirect(createCustomer({}, form({ ...customer, "address.line1": "1 Main St", "address.city": "Austin" })), "/dashboard/customers/c1");

        expect(state.supabase.callsTo("customers", "insert")[0].values).toEqual({
            business_id: BUSINESS_ID,
            full_name: "Ada Lovelace",
            email: "ada@example.com",
            phone: "+1 (512) 555-0100",
            notes: null,
            tags: ["vip", "weekly"],
            email_opt_in: true,
            sms_opt_in: false,
        });
        expect(state.supabase.callsTo("customer_addresses", "insert")[0].values).toMatchObject({
            business_id: BUSINESS_ID,
            customer_id: "c1",
            line1: "1 Main St",
            lat: 30.27,
            lng: -97.74,
            google_place_id: "place_1",
            is_primary: true,
        });
    });

    it("skips the address when none was entered", async () => {
        state.supabase.respond("customers.insert", { data: { id: "c1" } });
        await expectRedirect(createCustomer({}, form({ fullName: "Ada" })), "/dashboard/customers/c1");
        expect(state.supabase.callsTo("customer_addresses")).toHaveLength(0);
    });

    it("validates fields and the address", async () => {
        const result = await createCustomer({}, form({ fullName: "", email: "not-an-email", phone: "call me", tags: "x".repeat(31) }));
        expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["fullName", "email", "phone", "tags"]));

        const badAddress = await createCustomer({}, form({ fullName: "Ada", "address.line1": "1", "address.lat": "200" }));
        expect(badAddress.fieldErrors).toBeDefined();
        expect(state.supabase.calls).toHaveLength(0);
    });

    it("flags a duplicate email on the email field", async () => {
        state.supabase.respond("customers.insert", { error: { code: "23505", message: "duplicate" } });
        expect(await createCustomer({}, form({ fullName: "Ada", email: "ada@example.com" }))).toEqual({
            fieldErrors: { email: ["You already have a customer with this email."] },
        });
    });

    it("is for owners and admins only", async () => {
        state.auth = { error: "Only owners and admins can change this." };
        expect((await createCustomer({}, form(customer))).error).toBeDefined();
        expect(state.supabase.calls).toHaveLength(0);
    });
});

describe("updateCustomer and deleteCustomer", () => {
    it("updates within the business", async () => {
        expect(await updateCustomer({}, form({ ...customer, customerId: "c1" }))).toEqual({ success: "Customer saved." });
        expect(state.supabase.callsTo("customers", "update")[0].filters).toEqual([
            ["eq", "id", "c1"],
            ["eq", "business_id", BUSINESS_ID],
        ]);
    });

    it("won't delete a customer with bookings", async () => {
        state.supabase.respond("customers.delete", { error: { code: "23503", message: "fk" } });
        expect((await deleteCustomer(form({ customerId: "c1" }))).error).toMatch(/has bookings or payments/);
    });

    it("returns to the list after deleting", async () => {
        await expectRedirect(deleteCustomer(form({ customerId: "c1" })), "/dashboard/customers");
        expect(state.supabase.callsTo("customers", "delete")[0].filters).toContainEqual(["eq", "business_id", BUSINESS_ID]);
    });
});

describe("addresses", () => {
    const address = { customerId: "c1", "address.line1": "9 Oak Ave", "address.lat": "30.1", "address.lng": "-97.1", label: "Rental", accessNotes: "Dog in yard" };

    it("adds a customer's first address as primary, using the browser's coordinates", async () => {
        state.supabase.respond("customer_addresses.select", { count: 0 });
        expect(await saveAddress({}, form(address))).toEqual({ success: "Address added." });
        expect(state.geocode).not.toHaveBeenCalled();
        expect(state.supabase.callsTo("customer_addresses", "insert")[0].values).toMatchObject({
            customer_id: "c1",
            lat: 30.1,
            lng: -97.1,
            label: "Rental",
            access_notes: "Dog in yard",
            is_primary: true,
        });
    });

    it("adds later addresses as secondary", async () => {
        state.supabase.respond("customer_addresses.select", { count: 1 });
        await saveAddress({}, form(address));
        expect(state.supabase.callsTo("customer_addresses", "insert")[0].values).toMatchObject({ is_primary: false });
    });

    it("edits an address in place", async () => {
        expect(await saveAddress({}, form({ ...address, addressId: "a1" }))).toEqual({ success: "Address saved." });
        expect(state.supabase.callsTo("customer_addresses", "update")[0].filters).toEqual([
            ["eq", "id", "a1"],
            ["eq", "business_id", BUSINESS_ID],
        ]);
    });

    it("removes an address", async () => {
        expect(await deleteAddress(form({ addressId: "a1" }))).toEqual({ success: "Address removed." });
    });

    describe("makePrimaryAddress", () => {
        it("swaps the primary to another of the customer's addresses", async () => {
            state.supabase.respond("customer_addresses.select", { data: { id: "a2" } });
            expect(await makePrimaryAddress(form({ customerId: "c1", addressId: "a2" }))).toEqual({ success: "Primary address updated." });

            const [clear, set] = state.supabase.callsTo("customer_addresses", "update");
            expect(clear.values).toEqual({ is_primary: false });
            expect(clear.filters).toContainEqual(["eq", "customer_id", "c1"]);
            expect(set.values).toEqual({ is_primary: true });
            expect(set.filters).toEqual([
                ["eq", "id", "a2"],
                ["eq", "customer_id", "c1"],
                ["eq", "business_id", BUSINESS_ID],
            ]);
        });

        it("leaves the current primary alone when the address isn't this customer's", async () => {
            expect(await makePrimaryAddress(form({ customerId: "c1", addressId: "someone-elses" }))).toEqual({ error: "We couldn't find that address." });
            expect(state.supabase.callsTo("customer_addresses", "update")).toHaveLength(0);
        });

        it("stops if clearing the old primary fails", async () => {
            state.supabase.respond("customer_addresses.select", { data: { id: "a2" } });
            state.supabase.respond("customer_addresses.update", { error: { message: "boom" } });
            expect((await makePrimaryAddress(form({ customerId: "c1", addressId: "a2" }))).error).toBe("We couldn't update the primary address.");
            expect(state.supabase.callsTo("customer_addresses", "update")).toHaveLength(1);
        });
    });
});

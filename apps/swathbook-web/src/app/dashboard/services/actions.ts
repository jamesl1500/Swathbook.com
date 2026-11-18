"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import { checkbox, dollarsToCents, invalid, text, type FormState } from "@/libs/forms";
import { parseQuestionsField } from "@/libs/service-questions";
import { createClient } from "@/libs/supabase/server";

const serviceSchema = z
    .object({
        name: z.string().trim().min(2, { error: "Name this service." }).max(80),
        description: z.string().trim().max(500).optional(),
        priceType: z.enum(["fixed", "starting_at", "quote"]),
        priceCents: dollarsToCents,
        durationMinutes: z.coerce.number().int().min(5).max(1440),
        depositType: z.enum(["none", "percent", "fixed"]),
        depositPercent: z.coerce.number().int().min(0).max(100),
        depositCents: z.union([z.literal("").transform(() => 0), dollarsToCents]),
        isActive: z.boolean(),
        isPublic: z.boolean(),
        /** Priced by the area the customer measures on the booking page. */
        byArea: z.boolean(),
        areaRateCents: z.union([z.literal("").transform(() => 0), dollarsToCents]),
        minutesPer1000: z.union([z.literal("").transform(() => null), z.coerce.number().int().min(1).max(600)]),
    })
    .superRefine((values, context) => {
        if (values.byArea && (values.areaRateCents < 1 || values.areaRateCents > 1_000_000)) {
            context.addIssue({ code: "custom", path: ["areaRateCents"], message: "Enter a price per 1,000 sq ft." });
        }
        if (values.depositType === "percent" && values.depositPercent < 1) {
            context.addIssue({ code: "custom", path: ["depositPercent"], message: "Pick a deposit percentage." });
        }
        if (values.depositType === "fixed" && values.depositCents < 50) {
            context.addIssue({ code: "custom", path: ["depositCents"], message: "Deposits start at $0.50." });
        }
        if (values.depositType === "fixed" && values.depositCents > values.priceCents && values.priceType === "fixed") {
            context.addIssue({ code: "custom", path: ["depositCents"], message: "A deposit can't be more than the price." });
        }
    });

export async function saveService(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;

    const parsed = serviceSchema.safeParse({
        name: text(formData, "name"),
        description: text(formData, "description") || undefined,
        priceType: text(formData, "priceType") || "fixed",
        priceCents: text(formData, "price") || "0",
        durationMinutes: text(formData, "durationMinutes"),
        depositType: text(formData, "depositType") || "none",
        depositPercent: text(formData, "depositPercent") || "0",
        depositCents: text(formData, "depositAmount"),
        isActive: checkbox(formData, "isActive"),
        isPublic: checkbox(formData, "isPublic"),
        byArea: checkbox(formData, "byArea"),
        areaRateCents: text(formData, "areaRate"),
        minutesPer1000: text(formData, "minutesPer1000"),
    });
    if (!parsed.success) return invalid(parsed.error);
    const values = parsed.data;

    // Questions customers answer when booking. Only forms that include the editor send them.
    const questions = formData.has("questions") ? parseQuestionsField(String(formData.get("questions"))) : null;
    if (questions && !questions.ok) return { error: questions.error, fieldErrors: { questions: [questions.error] } };

    const row = {
        name: values.name,
        description: values.description ?? null,
        // Priced by area always reads "From" the minimum.
        price_type: values.byArea ? ("starting_at" as const) : values.priceType,
        price_cents: values.priceCents,
        duration_minutes: values.durationMinutes,
        deposit_type: values.depositType,
        deposit_percent: values.depositType === "percent" ? values.depositPercent : 0,
        deposit_amount_cents: values.depositType === "fixed" ? values.depositCents : 0,
        is_active: values.isActive,
        is_public: values.isPublic,
        price_per_1000_sqft_cents: values.byArea ? values.areaRateCents : null,
        minutes_per_1000_sqft: values.byArea ? values.minutesPer1000 : null,
    };

    const supabase = await createClient();
    const editingId = text(formData, "serviceId");
    let serviceId = editingId;
    if (editingId) {
        const { error } = await supabase.from("services").update(row).eq("id", editingId).eq("business_id", auth.businessId);
        if (error) return { error: "We couldn't save that service. Please try again." };
    } else {
        const { count } = await supabase.from("services").select("id", { count: "exact", head: true }).eq("business_id", auth.businessId);
        const { data, error } = await supabase
            .from("services")
            .insert({ ...row, business_id: auth.businessId, sort_order: count ?? 0 })
            .select("id")
            .single();
        if (error || !data) return { error: "We couldn't add that service. Please try again." };
        serviceId = data.id;
    }

    if (questions?.ok) {
        const { error } = await supabase.rpc("save_service_questions", {
            p_service_id: serviceId,
            p_questions: questions.questions.map(({ id, prompt, kind, options, required }) => ({ ...(id ? { id } : {}), prompt, kind, options, required })),
        });
        if (error) {
            console.error("[services] saving questions failed", error.code ?? error.message);
            refresh();
            return { error: editingId ? "The service saved, but its questions didn't. Please try again." : "The service was added, but its questions weren't. Edit it to add them again." };
        }
    }

    refresh();
    return { success: editingId ? "Service saved." : "Service added." };
}

export async function deleteService(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;

    const supabase = await createClient();
    // Past bookings keep their own copy of the name and price (booking_items).
    const { error } = await supabase.from("services").delete().eq("id", text(formData, "serviceId")).eq("business_id", auth.businessId);
    if (error) return { error: "We couldn't remove that service." };
    refresh();
    return { success: "Service removed." };
}

export async function moveService(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;

    const supabase = await createClient();
    const { data: services } = await supabase
        .from("services")
        .select("id, sort_order")
        .eq("business_id", auth.businessId)
        .order("sort_order")
        .order("name");
    if (!services) return { error: "We couldn't reorder your services." };

    const index = services.findIndex((service) => service.id === text(formData, "serviceId"));
    const target = index + (text(formData, "direction") === "up" ? -1 : 1);
    if (index < 0 || target < 0 || target >= services.length) return {};

    const reordered = [...services];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    await Promise.all(
        reordered.map((service, position) =>
            service.sort_order === position
                ? null
                : supabase.from("services").update({ sort_order: position }).eq("id", service.id).eq("business_id", auth.businessId),
        ),
    );
    refresh();
    return {};
}

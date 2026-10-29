"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_BUSINESS_COOKIE, activeBusinessCookieOptions } from "@/libs/active-business";
import { getCurrentUser, getDraftBusiness } from "@/libs/auth";
import { routes } from "@/libs/routes";
import { createClient } from "@/libs/supabase/server";
import { onboardingSchema, slugField } from "./schema";

export type SlugCheck = { available: boolean; reason?: string };
export type OnboardingResult = { error: string; field?: "slug" };

export async function checkSlugAvailability(slug: string): Promise<SlugCheck> {
    const parsed = slugField.safeParse(slug);
    if (!parsed.success) {
        return { available: false, reason: parsed.error.issues[0]?.message };
    }

    const user = await getCurrentUser();
    if (!user) return { available: false, reason: "Your session expired. Log in again to continue." };

    // A draft being resumed keeps its own slug.
    const draft = await getDraftBusiness(user.id);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("is_slug_available", {
        p_slug: parsed.data,
        p_business_id: draft?.id,
    });

    // If the check itself fails, let them continue; the unique index is the real guard.
    if (error) return { available: true };
    return data ? { available: true } : { available: false, reason: "Someone already has that link. Try another." };
}

/**
 * Saves the whole onboarding payload. Resumes the user's unfinished business if
 * there is one, otherwise creates a new one (users can run several). Safe to
 * re-run: services and hours are replaced.
 */
export async function completeOnboarding(input: unknown): Promise<OnboardingResult | void> {
    const user = await getCurrentUser();
    if (!user) redirect(`${routes.login}?next=${routes.onboarding}`);

    const parsed = onboardingSchema.safeParse(input);
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
    }
    const values = parsed.data;
    const supabase = await createClient();

    const details = {
        name: values.businessName,
        slug: values.slug,
        trade: values.trade,
        phone: values.phone || null,
        timezone: values.timezone || "UTC",
        base_address: values.baseAddress,
        service_radius_miles: values.serviceRadiusMiles,
    };

    // Not an upsert: owner_id is insert-only for clients, so a draft is
    // updated without touching it.
    const draft = await getDraftBusiness(user.id);
    const { data: business, error: businessError } = draft
        ? await supabase.from("businesses").update(details).eq("id", draft.id).select("id").single<{ id: string }>()
        : await supabase
              .from("businesses")
              .insert({ ...details, owner_id: user.id })
              .select("id")
              .single<{ id: string }>();

    if (businessError || !business) {
        if (businessError?.code === "23505") {
            return { error: "That booking link was just taken. Pick another one.", field: "slug" };
        }
        if (businessError?.message.includes("business_limit_reached")) {
            return { error: "You've reached the limit of 25 businesses. Contact us to add more." };
        }
        return { error: "We couldn't save your business. Please try again." };
    }

    const { error: clearServicesError } = await supabase.from("services").delete().eq("business_id", business.id);
    const { error: servicesError } = clearServicesError
        ? { error: clearServicesError }
        : await supabase.from("services").insert(
              values.services.map((service, index) => ({
                  business_id: business.id,
                  name: service.name,
                  price_cents: Math.round(service.price * 100),
                  duration_minutes: service.durationMinutes,
                  deposit_type: service.depositPercent > 0 ? "percent" : "none",
                  deposit_percent: service.depositPercent,
                  sort_order: index,
              })),
          );
    if (servicesError) return { error: "We couldn't save your services. Please try again." };

    const { error: clearHoursError } = await supabase.from("business_hours").delete().eq("business_id", business.id);
    const { error: hoursError } = clearHoursError
        ? { error: clearHoursError }
        : await supabase.from("business_hours").insert(
              values.workDays.map((weekday) => ({
                  business_id: business.id,
                  weekday,
                  opens_at: values.dayStart,
                  closes_at: values.dayEnd,
              })),
          );
    if (hoursError) return { error: "We couldn't save your hours. Please try again." };

    const { error: completeError } = await supabase
        .from("businesses")
        .update({ onboarding_completed_at: new Date().toISOString(), is_published: true })
        .eq("id", business.id);
    if (completeError) return { error: "Almost there. We couldn't finish setup. Please try again." };

    // Open the dashboard on the business that was just launched.
    (await cookies()).set(ACTIVE_BUSINESS_COOKIE, business.id, activeBusinessCookieOptions);
    redirect(routes.dashboard);
}

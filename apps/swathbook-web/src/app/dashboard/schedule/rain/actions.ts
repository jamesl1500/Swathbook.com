"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import { sendQueuedEmailsSoon } from "@/libs/email/worker";
import { createClient } from "@/libs/supabase/server";
import { loadTeam } from "@/libs/team";
import { isDateKey } from "@/libs/time";

const planSchema = z.object({
    businessId: z.uuid(),
    from: z.string().refine(isDateKey),
    to: z.string().refine(isDateKey),
    skip: z.array(z.uuid()).max(200).default([]),
    forecast: z.object({ chance: z.number().int().min(0).max(100), summary: z.string().max(120).nullable() }).nullable().default(null),
});

export type RainMove = {
    bookingId: string;
    customerName: string;
    services: string;
    fromStart: string;
    toStart: string | null;
    memberName: string | null;
    /** Lands with a different crew member than before. */
    reassigned: boolean;
};

export type RainPlan = { ok: true; moves: RainMove[]; unplaced: RainMove[]; applied: boolean } | { ok: false; error: string };

const ERRORS: Record<string, string> = {
    not_allowed: "Only owners and admins can move a day's jobs.",
    invalid_days: "Pick a different day, within your booking window and not in the past.",
};

type PlanResult = {
    moves: Array<{ booking_id: string; from_start: string; to_start: string; member_id: string | null; reassigned: boolean }>;
    unplaced: string[];
};

async function plan(input: z.input<typeof planSchema>, apply: boolean): Promise<RainPlan> {
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Pick the rainy day and where to move its jobs." };
    const auth = await authorizeBusiness(parsed.data.businessId, { manage: true });
    if (isFailure(auth)) return { ok: false, error: auth.error };
    const { from, to, skip, forecast } = parsed.data;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("plan_rain_delay", {
        p_business_id: auth.businessId,
        p_from: from,
        p_to: to,
        p_skip: skip,
        p_apply: apply,
        ...(forecast ? { p_forecast: forecast } : {}),
    });
    if (error || !data) {
        const code = Object.keys(ERRORS).find((key) => error?.message.includes(key));
        if (!code) console.error("[rain] plan_rain_delay failed", error);
        return { ok: false, error: code ? ERRORS[code] : "We couldn't work out the moves. Please try again." };
    }
    const result = data as unknown as PlanResult;

    // Names for the list: who, what, and which crew member.
    const ids = [...result.moves.map((move) => move.booking_id), ...result.unplaced];
    const [{ data: bookings }, team] = await Promise.all([
        ids.length
            ? supabase.from("bookings").select("id, scheduled_start, customers(full_name), booking_items(name, sort_order)").in("id", ids)
            : Promise.resolve({ data: [] as never[] }),
        loadTeam(auth.businessId),
    ]);
    const byId = new Map((bookings ?? []).map((booking) => [booking.id, booking]));
    const describe = (id: string) => {
        const booking = byId.get(id);
        return {
            customerName: booking?.customers?.full_name ?? "Customer",
            services: [...(booking?.booking_items ?? [])]
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item) => item.name)
                .join(", "),
        };
    };

    const moves: RainMove[] = result.moves.map((move) => ({
        bookingId: move.booking_id,
        ...describe(move.booking_id),
        fromStart: move.from_start,
        toStart: move.to_start,
        memberName: team.find((person) => person.id === move.member_id)?.name ?? null,
        reassigned: move.reassigned,
    }));
    const unplaced: RainMove[] = result.unplaced.map((id) => ({
        bookingId: id,
        ...describe(id),
        fromStart: byId.get(id)?.scheduled_start ?? "",
        toStart: null,
        memberName: null,
        reassigned: false,
    }));

    if (apply) {
        sendQueuedEmailsSoon();
        refresh();
    }
    return { ok: true, moves, unplaced, applied: apply };
}

/** What moving the day would do. Nothing changes. */
export async function previewRainDelay(input: z.input<typeof planSchema>) {
    return plan(input, false);
}

/** Moves the day's jobs (except `skip`) and emails each customer. */
export async function applyRainDelay(input: z.input<typeof planSchema>) {
    return plan(input, true);
}

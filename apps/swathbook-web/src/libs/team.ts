/**
 * team.ts
 *
 * A business's team members with display names (from the membership row, or
 * the person's profile). profiles aren't foreign-keyed to business_members, so
 * names are joined here rather than embedded.
 *
 * @module src/libs/team
 * @since 1.0.0
 */

import { createClient } from "./supabase/server";

export type TeamMember = {
    id: string;
    userId: string;
    name: string;
    role: "owner" | "admin" | "crew";
    color: string | null;
    isBookable: boolean;
};

const PALETTE = ["#1c3d70", "#c2410c", "#0e7c86", "#7a4fb0", "#2f855a", "#b7791f"];

export async function loadTeam(businessId: string): Promise<TeamMember[]> {
    const supabase = await createClient();
    const { data: members } = await supabase
        .from("business_members")
        .select("id, user_id, role, display_name, calendar_color, is_bookable, created_at")
        .eq("business_id", businessId)
        .eq("status", "active")
        .order("created_at");
    if (!members?.length) return [];

    const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in(
            "id",
            members.map((member) => member.user_id),
        );
    const names = new Map(profiles?.map((profile) => [profile.id, profile.full_name]) ?? []);

    return members.map((member, index) => ({
        id: member.id,
        userId: member.user_id,
        name: member.display_name ?? names.get(member.user_id) ?? (member.role === "owner" ? "Owner" : `Crew member ${index + 1}`),
        role: member.role,
        color: member.calendar_color ?? PALETTE[index % PALETTE.length],
        isBookable: member.is_bookable,
    }));
}

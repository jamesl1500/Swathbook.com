"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import { sendEmail } from "@/libs/email/send";
import { teamInviteEmail } from "@/libs/email/templates";
import { invalid, text, type FormState } from "@/libs/forms";
import { invitePath } from "@/libs/routes";
import { getSiteUrl } from "@/libs/site-url";
import { createClient } from "@/libs/supabase/server";
import { emailField } from "@/libs/validation/auth";

export type InviteState = FormState & { inviteUrl?: string };

const roleField = z.enum(["admin", "crew"], { error: "Pick a role." });
const inviteSchema = z.object({ email: emailField, role: roleField });

const INVITE_ERRORS: Record<string, string> = {
    seat_limit: "Your plan's seats are full. Upgrade to Crew for up to 5 people, or remove someone first.",
    only_owner_can_invite_admins: "Only the owner can invite admins.",
    not_allowed: "Only owners and admins can invite people.",
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function inviteAndEmail(supabase: Supabase, auth: { businessId: string; user: { fullName: string; email: string } }, email: string, role: "admin" | "crew") {
    const { data: token, error } = await supabase.rpc("create_business_invitation", { p_business_id: auth.businessId, p_email: email, p_role: role });
    if (error || !token) {
        const code = Object.keys(INVITE_ERRORS).find((key) => error?.message.includes(key));
        return { error: code ? INVITE_ERRORS[code] : "We couldn't create that invite. Please try again." } satisfies InviteState;
    }

    const { data: business } = await supabase.from("businesses").select("name").eq("id", auth.businessId).single();
    const inviteUrl = `${await getSiteUrl()}${invitePath(token)}`;
    const sent = await sendEmail({
        to: email,
        ...teamInviteEmail({ businessName: business?.name ?? "your team", inviterName: auth.user.fullName || auth.user.email, role, url: inviteUrl }),
        replyTo: auth.user.email,
    });
    refresh();
    // The link is shown to the inviter too, so they can text it if email is slow.
    return sent.ok
        ? ({ success: `Invite sent to ${email}.`, inviteUrl } satisfies InviteState)
        : ({ success: `Invite created, but the email didn't send. Share this link with ${email}:`, inviteUrl } satisfies InviteState);
}

export async function inviteMember(_prev: InviteState, formData: FormData): Promise<InviteState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const parsed = inviteSchema.safeParse({ email: text(formData, "email"), role: text(formData, "role") || "crew" });
    if (!parsed.success) return invalid(parsed.error);

    const supabase = await createClient();
    const { data: existing } = await supabase.rpc("team_members", { p_business_id: auth.businessId });
    if (existing?.some((member) => member.email?.toLowerCase() === parsed.data.email)) {
        return { fieldErrors: { email: ["They're already on your team."] } };
    }
    return inviteAndEmail(supabase, auth, parsed.data.email, parsed.data.role);
}

const idField = z.uuid();

export async function resendInvite(formData: FormData): Promise<InviteState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const inviteId = idField.safeParse(formData.get("inviteId"));
    if (!inviteId.success) return { error: "That invite no longer exists." };

    const supabase = await createClient();
    const { data: invite } = await supabase
        .from("business_invitations")
        .select("email, role")
        .eq("id", inviteId.data)
        .eq("business_id", auth.businessId)
        .maybeSingle();
    if (!invite || invite.role === "owner") return { error: "That invite no longer exists." };
    // Creating a new invite for the same email replaces the old link.
    return inviteAndEmail(supabase, auth, invite.email, invite.role);
}

export async function revokeInvite(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const inviteId = idField.safeParse(formData.get("inviteId"));
    if (!inviteId.success) return { error: "That invite no longer exists." };

    const supabase = await createClient();
    const { error } = await supabase
        .from("business_invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", inviteId.data)
        .eq("business_id", auth.businessId)
        .is("accepted_at", null);
    if (error) return { error: "We couldn't cancel that invite." };
    refresh();
    return { success: "Invite canceled." };
}

export async function changeRole(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    if (auth.role !== "owner") return { error: "Only the owner can change roles." };
    const memberId = idField.safeParse(formData.get("memberId"));
    const role = roleField.safeParse(formData.get("role"));
    if (!memberId.success || !role.success) return { error: "Pick a role." };

    const supabase = await createClient();
    const { data, error } = await supabase
        .from("business_members")
        .update({ role: role.data })
        .eq("id", memberId.data)
        .eq("business_id", auth.businessId)
        .neq("role", "owner")
        .select("id");
    if (error || !data?.length) return { error: "We couldn't change that role." };
    refresh();
    return { success: role.data === "admin" ? "They're an admin now." : "They're on the crew now." };
}

export async function removeMember(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const memberId = idField.safeParse(formData.get("memberId"));
    if (!memberId.success) return { error: "That person isn't on the team." };

    const supabase = await createClient();
    const { data: member } = await supabase
        .from("business_members")
        .select("user_id, role")
        .eq("id", memberId.data)
        .eq("business_id", auth.businessId)
        .maybeSingle();
    if (!member) return { error: "That person isn't on the team." };
    if (member.role === "owner") return { error: "The owner can't be removed." };
    if (member.user_id === auth.user.id) return { error: "You can't remove yourself." };
    if (member.role === "admin" && auth.role !== "owner") return { error: "Only the owner can remove admins." };

    const { error } = await supabase.from("business_members").delete().eq("id", memberId.data).eq("business_id", auth.businessId);
    if (error) return { error: "We couldn't remove them." };
    refresh();
    return { success: "Removed from the team. Their jobs are now unassigned." };
}

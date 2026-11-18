"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import { text, type FormState } from "@/libs/forms";
import { IMAGE_TYPES, JOB_FILES_BUCKET, MAX_IMAGE_BYTES, MAX_JOB_PHOTOS } from "@/libs/supabase/storage";
import { createClient } from "@/libs/supabase/server";

/*
 * The job report's photos and note. Anyone on the team can add them (crew
 * take the photos), so these check membership, not management, and RLS
 * scopes every read and write to the business.
 */

const bookingIdField = z.uuid();
const phaseField = z.enum(["before", "after"]);

async function bookingInBusiness(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string, bookingId: unknown) {
    const id = bookingIdField.safeParse(bookingId);
    if (!id.success) return null;
    const { data } = await supabase.from("bookings").select("id").eq("id", id.data).eq("business_id", businessId).maybeSingle();
    return data?.id ?? null;
}

export async function uploadJobPhoto(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"));
    if (isFailure(auth)) return auth;
    const phase = phaseField.safeParse(formData.get("phase"));
    if (!phase.success) return { error: "Say whether it's a before or after photo." };
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo to upload." };
    if (!IMAGE_TYPES[file.type]) return { error: "Use a PNG, JPG or WebP photo." };
    if (file.size > MAX_IMAGE_BYTES) return { error: "That photo is too large. Try a smaller one." };

    const supabase = await createClient();
    const bookingId = await bookingInBusiness(supabase, auth.businessId, formData.get("bookingId"));
    if (!bookingId) return { error: "That job no longer exists." };

    const { count } = await supabase
        .from("booking_attachments")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", bookingId)
        .not("phase", "is", null);
    if ((count ?? 0) >= MAX_JOB_PHOTOS) return { error: `A job report holds up to ${MAX_JOB_PHOTOS} photos. Remove one to add another.` };

    const path = `${auth.businessId}/${bookingId}/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
    const { error: uploadError } = await supabase.storage.from(JOB_FILES_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { error: "We couldn't upload that photo. Please try again." };

    const { error } = await supabase.from("booking_attachments").insert({
        business_id: auth.businessId,
        booking_id: bookingId,
        kind: "photo",
        phase: phase.data,
        storage_path: path,
        content_type: file.type,
        size_bytes: file.size,
        uploaded_by: auth.user.id,
    });
    if (error) {
        await supabase.storage.from(JOB_FILES_BUCKET).remove([path]);
        return { error: "We couldn't save that photo. Please try again." };
    }
    refresh();
    return { success: `${phase.data === "before" ? "Before" : "After"} photo added.` };
}

export async function deleteJobPhoto(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"));
    if (isFailure(auth)) return auth;
    const photoId = z.uuid().safeParse(formData.get("photoId"));
    if (!photoId.success) return { error: "That photo no longer exists." };

    const supabase = await createClient();
    // RLS lets managers delete any photo and crew only their own.
    const { data: photo } = await supabase
        .from("booking_attachments")
        .delete()
        .eq("id", photoId.data)
        .eq("business_id", auth.businessId)
        .select("storage_path")
        .maybeSingle();
    if (!photo) return { error: "You can only remove photos you added." };
    await supabase.storage.from(JOB_FILES_BUCKET).remove([photo.storage_path]);
    refresh();
    return { success: "Photo removed." };
}

export async function saveReportNote(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"));
    if (isFailure(auth)) return auth;
    const note = text(formData, "note");
    if (note.length > 1000) return { error: "Keep the note under 1,000 characters.", fieldErrors: { note: ["Keep it under 1,000 characters."] } };

    const supabase = await createClient();
    const bookingId = await bookingInBusiness(supabase, auth.businessId, formData.get("bookingId"));
    if (!bookingId) return { error: "That job no longer exists." };
    const { error } = await supabase.rpc("save_job_report_note", { p_booking_id: bookingId, p_note: note });
    if (error) return { error: "We couldn't save the note." };
    refresh();
    return { success: "Note saved." };
}

"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { slugField } from "@/app/onboarding/schema";
import { authorizeBusiness, isFailure } from "@/libs/dashboard";
import { checkbox, invalid, text, type FormState } from "@/libs/forms";
import { createClient } from "@/libs/supabase/server";
import { BUSINESS_ASSETS_BUCKET, IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_PHOTOS } from "@/libs/supabase/storage";

const optionalUrl = z
    .string()
    .trim()
    .max(300)
    .transform((value) => (value && !/^https?:\/\//i.test(value) ? `https://${value}` : value))
    .pipe(z.union([z.literal(""), z.url({ protocol: /^https?$/, error: "Enter a full web address." })]));

const profileSchema = z.object({
    name: z.string().trim().min(2, { error: "Enter your business name." }).max(80),
    slug: slugField,
    description: z.string().trim().max(1000),
    serviceArea: z.string().trim().max(120, { error: "Keep it under 120 characters." }),
    phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9 ().-]{7,20}$/, { error: "Enter a valid phone number." })]),
    email: z.union([z.literal(""), z.email({ error: "Enter a valid email address." })]),
    websiteUrl: optionalUrl,
    brandColor: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "Pick a color." })]),
});

export async function updateBookingPage(_prev: FormState, formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;

    const parsed = profileSchema.safeParse({
        name: text(formData, "name"),
        slug: text(formData, "slug"),
        description: text(formData, "description"),
        serviceArea: text(formData, "serviceArea"),
        phone: text(formData, "phone"),
        email: text(formData, "email").toLowerCase(),
        websiteUrl: text(formData, "websiteUrl"),
        brandColor: text(formData, "brandColor").toLowerCase(),
    });
    if (!parsed.success) return invalid(parsed.error);
    const values = parsed.data;

    const supabase = await createClient();
    if (values.slug !== auth.business.slug) {
        const { data: available } = await supabase.rpc("is_slug_available", { p_slug: values.slug, p_business_id: auth.businessId });
        if (available === false) return { fieldErrors: { slug: ["Someone already has that link. Try another."] } };
    }

    const { error } = await supabase
        .from("businesses")
        .update({
            name: values.name,
            slug: values.slug,
            description: values.description || null,
            service_area: values.serviceArea || null,
            phone: values.phone || null,
            email: values.email || null,
            website_url: values.websiteUrl || null,
            brand_color: values.brandColor || null,
        })
        .eq("id", auth.businessId);

    if (error) {
        if (error.code === "23505") return { fieldErrors: { slug: ["Someone just took that link. Try another."] } };
        return { error: "We couldn't save your booking page. Please try again." };
    }
    refresh();
    return {
        success: values.slug !== auth.business.slug ? "Saved. Your link changed, so update anywhere you've shared the old one." : "Booking page saved.",
    };
}

export async function setPublished(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const published = checkbox(formData, "published");
    const supabase = await createClient();
    const { error } = await supabase.from("businesses").update({ is_published: published }).eq("id", auth.businessId);
    if (error) return { error: "We couldn't update your booking page." };
    refresh();
    return { success: published ? "Your booking page is taking bookings." : "Bookings are paused. Your page shows a closed notice." };
}

// ---------------------------------------------------------------------------
// Images: logo, cover and gallery. The browser resizes before upload
// (libs/image-resize.ts), so each request carries one modest file.
// ---------------------------------------------------------------------------

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ImageColumn = "logo_path" | "cover_path";

function readImage(formData: FormData): File | string {
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) return "Choose an image to upload.";
    if (!IMAGE_TYPES[file.type]) return "Use a PNG, JPG or WebP image.";
    if (file.size > MAX_IMAGE_BYTES) return "That image is too large. Try a smaller one.";
    return file;
}

async function storeImage(supabase: Supabase, path: string, file: File) {
    const { error } = await supabase.storage
        .from(BUSINESS_ASSETS_BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    return !error;
}

async function currentImage(supabase: Supabase, businessId: string, column: ImageColumn) {
    const { data } = await supabase.from("businesses").select("logo_path, cover_path").eq("id", businessId).single();
    return data?.[column] ?? null;
}

function imagePatch(column: ImageColumn, value: string | null) {
    return column === "logo_path" ? { logo_path: value } : { cover_path: value };
}

function capitalize(label: string) {
    return `${label[0].toUpperCase()}${label.slice(1)}`;
}

async function replaceBusinessImage(formData: FormData, column: ImageColumn, label: string): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const file = readImage(formData);
    if (typeof file === "string") return { error: file };

    const supabase = await createClient();
    const previous = await currentImage(supabase, auth.businessId, column);
    const path = `${auth.businessId}/${column === "logo_path" ? "logo" : "cover"}-${Date.now()}.${IMAGE_TYPES[file.type]}`;

    if (!(await storeImage(supabase, path, file))) return { error: "We couldn't upload that image. Please try again." };
    const { error } = await supabase.from("businesses").update(imagePatch(column, path)).eq("id", auth.businessId);
    if (error) {
        await supabase.storage.from(BUSINESS_ASSETS_BUCKET).remove([path]);
        return { error: `We couldn't save your ${label}.` };
    }
    if (previous) await supabase.storage.from(BUSINESS_ASSETS_BUCKET).remove([previous]);
    refresh();
    return { success: `${capitalize(label)} updated.` };
}

async function clearBusinessImage(formData: FormData, column: ImageColumn, label: string): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const supabase = await createClient();
    const previous = await currentImage(supabase, auth.businessId, column);
    const { error } = await supabase.from("businesses").update(imagePatch(column, null)).eq("id", auth.businessId);
    if (error) return { error: `We couldn't remove your ${label}.` };
    if (previous) await supabase.storage.from(BUSINESS_ASSETS_BUCKET).remove([previous]);
    refresh();
    return { success: `${capitalize(label)} removed.` };
}

export async function uploadLogo(formData: FormData) {
    return replaceBusinessImage(formData, "logo_path", "logo");
}

export async function removeLogo(formData: FormData) {
    return clearBusinessImage(formData, "logo_path", "logo");
}

export async function uploadCover(formData: FormData) {
    return replaceBusinessImage(formData, "cover_path", "cover photo");
}

export async function removeCover(formData: FormData) {
    return clearBusinessImage(formData, "cover_path", "cover photo");
}

const PHOTO_LIMIT_MESSAGE = `Your page can show up to ${MAX_PHOTOS} photos. Remove one to add another.`;

export async function uploadPhoto(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const file = readImage(formData);
    if (typeof file === "string") return { error: file };

    const supabase = await createClient();
    const { data: existing } = await supabase
        .from("business_photos")
        .select("sort_order")
        .eq("business_id", auth.businessId)
        .order("sort_order", { ascending: false });
    if ((existing?.length ?? 0) >= MAX_PHOTOS) return { error: PHOTO_LIMIT_MESSAGE };

    const path = `${auth.businessId}/photos/${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
    if (!(await storeImage(supabase, path, file))) return { error: "We couldn't upload that photo. Please try again." };

    const { error } = await supabase.from("business_photos").insert({
        business_id: auth.businessId,
        storage_path: path,
        sort_order: (existing?.[0]?.sort_order ?? -1) + 1,
    });
    if (error) {
        await supabase.storage.from(BUSINESS_ASSETS_BUCKET).remove([path]);
        return { error: error.message === "photo_limit" ? PHOTO_LIMIT_MESSAGE : "We couldn't save that photo. Please try again." };
    }
    refresh();
    return { success: "Photo added." };
}

const photoIdField = z.uuid({ error: "That photo no longer exists." });

export async function deletePhoto(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const photoId = photoIdField.safeParse(formData.get("photoId"));
    if (!photoId.success) return { error: "That photo no longer exists." };

    const supabase = await createClient();
    const { data: photo } = await supabase
        .from("business_photos")
        .delete()
        .eq("id", photoId.data)
        .eq("business_id", auth.businessId)
        .select("storage_path")
        .maybeSingle();
    if (!photo) return { error: "That photo no longer exists." };
    await supabase.storage.from(BUSINESS_ASSETS_BUCKET).remove([photo.storage_path]);
    refresh();
    return { success: "Photo removed." };
}

const captionSchema = z.object({
    photoId: photoIdField,
    caption: z.string().trim().max(140, { error: "Keep captions under 140 characters." }),
});

export async function savePhotoCaption(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const parsed = captionSchema.safeParse({ photoId: formData.get("photoId"), caption: text(formData, "caption") });
    if (!parsed.success) return invalid(parsed.error);

    const supabase = await createClient();
    const { error } = await supabase
        .from("business_photos")
        .update({ caption: parsed.data.caption || null })
        .eq("id", parsed.data.photoId)
        .eq("business_id", auth.businessId);
    if (error) return { error: "We couldn't save that caption." };
    refresh();
    return { success: "Caption saved." };
}

/** Moves a photo one place earlier or later, then rewrites the order as 0..n so gaps never build up. */
export async function movePhoto(formData: FormData): Promise<FormState> {
    const auth = await authorizeBusiness(formData.get("businessId"), { manage: true });
    if (isFailure(auth)) return auth;
    const photoId = photoIdField.safeParse(formData.get("photoId"));
    if (!photoId.success) return { error: "That photo no longer exists." };
    const step = formData.get("direction") === "earlier" ? -1 : 1;

    const supabase = await createClient();
    const { data: photos } = await supabase
        .from("business_photos")
        .select("id")
        .eq("business_id", auth.businessId)
        .order("sort_order")
        .order("created_at")
        .order("id");
    const ids = (photos ?? []).map((photo) => photo.id);
    const from = ids.indexOf(photoId.data);
    const to = from + step;
    if (from === -1 || to < 0 || to >= ids.length) return {};
    [ids[from], ids[to]] = [ids[to], ids[from]];

    const results = await Promise.all(
        ids.map((id, index) => supabase.from("business_photos").update({ sort_order: index }).eq("id", id).eq("business_id", auth.businessId)),
    );
    if (results.some((result) => result.error)) return { error: "We couldn't reorder your photos." };
    refresh();
    return {};
}

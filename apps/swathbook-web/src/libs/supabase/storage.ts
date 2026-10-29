/**
 * storage.ts
 *
 * Paths and public URLs for Supabase Storage.
 *   business-assets (public): <business_id>/<file>, gallery in <business_id>/photos/<file>
 *   job-files (private):      <business_id>/<booking_id>/<file>
 *
 * @module src/libs/supabase/storage
 * @since 1.0.0
 */

export const BUSINESS_ASSETS_BUCKET = "business-assets";

export function publicAssetUrl(path: string | null | undefined) {
    if (!path) return null;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    return base ? `${base}/storage/v1/object/public/${BUSINESS_ASSETS_BUCKET}/${path}` : null;
}

/** Image types accepted for logos, covers and gallery photos (the bucket allows these). */
export const IMAGE_TYPES: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
};

/** After in-browser resizing, real photos land far below this. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Matches the database limit on business_photos. */
export const MAX_PHOTOS = 12;

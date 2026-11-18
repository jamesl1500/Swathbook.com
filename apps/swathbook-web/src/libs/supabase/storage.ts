/**
 * storage.ts
 *
 * Paths and public URLs for Supabase Storage.
 *   business-assets (public): <business_id>/<file>, gallery in <business_id>/photos/<file>
 *   job-files (private):      <business_id>/<booking_id>/<file>
 *   avatars (private):        <user_id>/<file> (profile photos, set from the customer app)
 *
 * @module src/libs/supabase/storage
 * @since 1.0.0
 */

export const BUSINESS_ASSETS_BUCKET = "business-assets";
export const JOB_FILES_BUCKET = "job-files";

/** Before and after photos on one job report. */
export const MAX_JOB_PHOTOS = 30;
export const AVATARS_BUCKET = "avatars";

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

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);

/**
 * The image type a file's first bytes say it is, from the types in
 * IMAGE_TYPES. The browser's declared type is only a claim; this checks it.
 */
export function imageTypeFromBytes(bytes: Uint8Array): keyof typeof IMAGE_TYPES | null {
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
    // "RIFF" <size> "WEBP"
    if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
    return null;
}

/** True when the file really is the image type it says it is. */
export async function isDeclaredImage(file: Blob) {
    if (!IMAGE_TYPES[file.type]) return false;
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    return imageTypeFromBytes(head) === file.type;
}

/** After in-browser resizing, real photos land far below this. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Matches the database limit on business_photos. */
export const MAX_PHOTOS = 12;

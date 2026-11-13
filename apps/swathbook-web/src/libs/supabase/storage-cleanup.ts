/**
 * storage-cleanup.ts
 *
 * Deleting files left behind when an account or business goes away. Storage
 * files aren't removed by database cascades, so every deletion path calls
 * these after its rows are gone. Server only (service role).
 *
 * @module src/libs/supabase/storage-cleanup
 * @since 1.0.0
 */

import type { createAdminClient } from "./admin";
import { AVATARS_BUCKET } from "./storage";

type Admin = ReturnType<typeof createAdminClient>;

async function listFiles(admin: Admin, bucket: string, folder: string): Promise<string[]> {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 });
    if (error) throw error;
    const nested = await Promise.all(
        (data ?? []).map((entry) =>
            // Folders come back without an id.
            entry.id ? Promise.resolve([`${folder}/${entry.name}`]) : listFiles(admin, bucket, `${folder}/${entry.name}`),
        ),
    );
    return nested.flat();
}

/** Removes everything under `folder`. Best effort: failures are logged, not thrown. */
export async function removeFolder(admin: Admin, bucket: string, folder: string) {
    try {
        const paths = await listFiles(admin, bucket, folder);
        if (paths.length) await admin.storage.from(bucket).remove(paths);
    } catch (error) {
        console.error(`[storage] couldn't remove ${bucket}/${folder}`, error);
    }
}

/** A person's profile photos (avatars/<user_id>/…). */
export function removeAvatarFiles(admin: Admin, userId: string) {
    return removeFolder(admin, AVATARS_BUCKET, userId);
}

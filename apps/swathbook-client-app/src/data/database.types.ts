/**
 * The database's generated types. `pnpm db:types` (repo root) writes them once,
 * into the web app; this re-exports them so both apps share a single copy.
 * Type-only, so nothing from the web app ends up in the bundle.
 */
export type { Database, Json } from '../../../swathbook-web/src/libs/supabase/database.types';

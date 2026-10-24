# Swathbook.com
Swathbook is a multi-tenant SaaS with three faces: a public booking page customers use, a web app the owner runs the business from, and a mobile app crews work from. Every lawn business is a tenant with its own customers, prices, crews and Stripe account.

## Development & testing

Requires Node 24, pnpm and Docker (for the local Supabase stack).

| Command | What it does |
| --- | --- |
| `pnpm db:start` | Start this repo's local Supabase (API on :55421, Studio on :55423, Mailpit on :55424) and apply `supabase/migrations` |
| `pnpm db:reset` | Rebuild the local database from the migrations |
| `pnpm db:test` | Database tests: RLS, grants, triggers and functions (`supabase/tests`) |
| `pnpm db:push` | Apply new migrations to the linked hosted project (uses this repo's Supabase CLI) |
| `pnpm db:types` | Regenerate `apps/swathbook-web/src/libs/supabase/database.types.ts` after schema changes |
| `pnpm test` | Unit and component tests (Vitest) |
| `pnpm test:e2e` | End-to-end tests (Playwright) against a production build wired to local Supabase; needs `pnpm db:start` first |

E2E tests read real confirmation and password-reset emails from Mailpit. The email templates in `supabase/templates` are the ones to paste into the hosted project's Auth > Email Templates.

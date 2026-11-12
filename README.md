# Swathbook.com
Swathbook is a multi-tenant SaaS with three faces: a public booking page customers use, a web app the owner runs the business from, and a mobile app crews work from. Every lawn business is a tenant with its own customers, prices, crews and Stripe account.

## Development & testing

Requires Node 24, pnpm and Docker (for the local Supabase stack).

| App | What it is |
| --- | --- |
| `apps/swathbook-web` | Next.js: marketing site, owner dashboard, public booking pages |
| `apps/swathbook-client-app` | Expo: the customer app for finding businesses and managing jobs (see its README) |

| Command | What it does |
| --- | --- |
| `pnpm db:start` | Start this repo's local Supabase (API on :55421, Studio on :55423, Mailpit on :55424) and apply `supabase/migrations` |
| `pnpm db:reset` | Rebuild the local database from the migrations |
| `pnpm db:test` | Database tests: RLS, grants, triggers and functions (`supabase/tests`) |
| `pnpm db:push` | Apply new migrations to the linked hosted project (uses this repo's Supabase CLI) |
| `pnpm db:types` | Regenerate the database types (web and client app) after schema changes |
| `pnpm test` | Unit and component tests (Vitest) |
| `pnpm app` | Start the customer app's Expo dev server (press i, a or w) |
| `pnpm test:e2e` | End-to-end tests (Playwright) against a production build wired to local Supabase; needs `pnpm db:start` first |

E2E tests read real confirmation and password-reset emails from Mailpit. The email templates in `supabase/templates` are the ones to paste into the hosted project's Auth > Email Templates. That includes **Magic Link** (`magic_link.html`), which carries the customer app's sign-in code. Confirm Signup (`confirmation.html`) shows the code to app sign-ups and the usual link to everyone else.

The customer app talks to the web app's `/api/app/*` routes, so deploy the web app (and `pnpm db:push` its migrations) before shipping an app build that needs them.

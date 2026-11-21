# Swathbook.com
Swathbook is a multi-tenant SaaS with three faces: a public booking page customers use, a web app the owner runs the business from, and a mobile app crews work from. Every lawn business is a tenant with its own customers, prices, crews and Stripe account.

## Development & testing

Requires Node 24, pnpm and Docker (for the local Supabase stack).

| App | What it is |
| --- | --- |
| `apps/swathbook-web` | Next.js: marketing site, owner dashboard, public booking pages, the business directory (`/businesses`, `/businesses/<trade>`) and the customer area (`/my`) |
| `apps/swathbook-client-app` | Expo: the customer app for finding businesses and managing jobs (see its README) |
| `apps/swathbook-owner-app` | Expo: the business app for owners, admins and crew: today's jobs, requests, cancellations, live alerts (see its README) |
| `packages/mobile` | `@swathbook/mobile`: the design system and helpers both Expo apps share |

| Command | What it does |
| --- | --- |
| `pnpm db:start` | Start this repo's local Supabase (API on :55421, Studio on :55423, Mailpit on :55424) and apply `supabase/migrations` |
| `pnpm db:reset` | Rebuild the local database from the migrations |
| `pnpm db:test` | Database tests: RLS, grants, triggers and functions (`supabase/tests`) |
| `pnpm db:push` | Apply new migrations to the linked hosted project (uses this repo's Supabase CLI) |
| `pnpm db:types` | Regenerate the database types after schema changes (written to the web app; the client app re-exports them) |
| `pnpm test` | Unit and component tests (Vitest), for the web app and the customer app |
| `pnpm stripe:listen` | Forward the Swathbook sandbox's Stripe events (platform and connected accounts) to the local web app's webhook. Set `STRIPE_WEBHOOK_SECRET` to the `whsec_` it prints, in the shell that runs the web app |
| `pnpm app` | Start the customer app's Expo dev server (press i, a or w) |
| `pnpm owner` | Start the business app's Expo dev server |
| `pnpm test:e2e` | End-to-end tests (Playwright) against a production build wired to local Supabase; needs `pnpm db:start` first |

E2E tests read real confirmation and password-reset emails from Mailpit. The email templates in `supabase/templates` are the ones to paste into the hosted project's Auth > Email Templates. That includes **Magic Link** (`magic_link.html`), which carries the customer app's sign-in code. Confirm Signup (`confirmation.html`) shows the code to app sign-ups and the usual link to everyone else.

Customers sign in on the website at `/my/sign-in` with the same emailed code as the app (the same Supabase account), then see and manage their jobs at `/my/jobs` and their details at `/my/profile`. Job pages check ownership with `my_booking` and then reuse the manage-booking panel from `/booking/<token>`, so both follow the same reschedule, cancel and payment rules.

Swathbook's only charge is 1.25% of each deposit and balance customers pay (tips are fee-free), taken as a Stripe application fee on the direct charge and returned on refunds. The rate is `SWATHBOOK_FEE_BPS` in `apps/swathbook-web/src/libs/billing/fees.ts`, which the charges, the billing page, the pricing page and the per-service take-home estimates all read. There are no plans, trials or seat limits (`20261121000100_fee_pricing.sql`).

The business app answers cancellation requests through the web app's `/api/owner/*` routes (they can refund through Stripe); everything else goes straight to Supabase as the signed-in member.

The customer app talks to the web app's `/api/app/*` routes, so deploy the web app (and `pnpm db:push` its migrations) before shipping an app build that needs them.

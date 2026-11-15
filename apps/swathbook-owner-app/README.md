# Swathbook for Business (owner app)

The app for the people running a Swathbook business: owners, admins and crew. See today's jobs, answer requests and cancellations, start and finish jobs, and hear about new bookings as they happen. Built with Expo (SDK 58) and Expo Router, for iOS, Android and web. Setting up a business, services, payouts and billing stay on the website; the More tab links there.

## Running it

The app needs Supabase and the web app (`apps/swathbook-web`), which serves `/api/owner` (answering cancellation requests, since that can refund through Stripe).

1. Copy `.env.example` to `.env.local` and fill it in. For the local stack (`pnpm db:start`), the URL and publishable key come from `npx supabase status`, and the site URL is `http://localhost:3000`. On a real phone, use your computer's LAN address instead of `localhost`/`127.0.0.1`. Release builds only accept `https://` URLs.
2. Run the web app against the same Supabase project (see the customer app's README for the local overrides).
3. From the repo root: `pnpm owner` (then press i, a or w). Or from this folder: `pnpm start`, `pnpm ios`, `pnpm android`, `pnpm web`.

Sign in with a business account's email and password (the same as the web dashboard).

Checks: `pnpm lint`, `pnpm typecheck` and `pnpm test`. Add native packages with `pnpm exec expo install <package>`; never `npm install` in this folder (it's a pnpm workspace member).

## Screens

| Route | What it is |
| --- | --- |
| `sign-in` | Email and password. Forgot password and sign-up open the website |
| `(tabs)/index` | Today: what needs a decision (requests, cancel requests, unpaid deposits), then today's jobs in order with "Start job" / "Mark complete" |
| `(tabs)/bookings` | Upcoming, Requests, Cancel requests, Awaiting deposit and Past, with search. Requests can be accepted or declined from the list |
| `(tabs)/alerts` | The notification feed. Opening it catches up (clears the badge) |
| `(tabs)/more` | Switch business, the dashboard's other pages on the web, sign out |
| `job/[id]` | A job: status, decisions, next steps (destructive ones under "More actions"), call / text / directions, what's booked, the customer's answers, where, team notes, activity |

## How it works

- **Data.** Screens use the hooks in `src/data/api.ts` (TanStack Query). Everything goes to Supabase as the signed-in member, so Row Level Security and the database functions apply exactly as on the dashboard: `booking_counts`, `booking_list`, `update_job_status`, `my_notifications`, `mark_notifications_read`. Answering a cancellation request is `POST /api/owner/bookings/:id/cancel-request` on the web app (bearer token), which can refund through Stripe. Each business's data is cached under `['business', id]`; signing out clears everything.
- **Live.** `src/data/live.ts` subscribes to the open business's `booking_events` over Supabase Realtime (RLS applies), and refreshes lists, counts, jobs and the Alerts badge when someone else changes something.
- **Rules.** `src/lib/job-rules.ts` decides each job's next steps for an owner, admin or crew member (the same rules as the dashboard; the database enforces them again). `booking-views.ts`, `time.ts` (the business's day, DST-safe), `notifications.ts` and `job-events.ts` are plain TypeScript with unit tests.
- **Security.** Sessions live in the iOS Keychain / Android Keystore under their own key (`swathbook-business-auth`), separate from the customer app's. Crew only see their own jobs and can't cancel, confirm or answer requests; owners and admins can. Release builds refuse plain-HTTP servers.
- **Shared code.** The design system, session storage, URL rules and formatting come from `packages/mobile` (`@swathbook/mobile`), shared with the customer app. `metro.config.js` resolves that package's own imports from this app, so the bundle holds a single React and React Native.

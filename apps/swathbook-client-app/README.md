# Swathbook client app

The customer app: find businesses on Swathbook, book them, and manage your jobs. Built with Expo (SDK 58) and Expo Router, for iOS, Android and web.

## Running it

The app needs Supabase and the web app (`apps/swathbook-web`), which serves its `/api/app` routes and the pages where deposits are paid.

1. Copy `.env.example` to `.env.local` and fill it in. For the local stack (`pnpm db:start`), the URL and publishable key come from `npx supabase status`, and the site URL is `http://localhost:3000`. On a real phone, use your computer's LAN address instead of `localhost`/`127.0.0.1` for both.
2. Run the web app against the **same** Supabase project. Its `.env` may point at the hosted project; for a local run, override that per process, and blank Resend so test emails go to Mailpit, not out:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable> \
   SUPABASE_SECRET_KEY=<local secret> RESEND_API_KEY= MAILPIT_URL=http://127.0.0.1:55424 \
   pnpm --filter swathbook-web dev
   ```

3. Start the app from the repo root:

   ```bash
   pnpm app   # then press i, a or w
   ```

Or from this folder: `pnpm start`, `pnpm ios`, `pnpm android`, `pnpm web`.

Sign-in codes arrive in Mailpit locally (http://127.0.0.1:55424).

Checks: `pnpm lint` and `pnpm exec tsc --noEmit`. Add native packages with `pnpm exec expo install <package>`; it resolves versions that work with this SDK.

## Screens

| Route | What it is |
| --- | --- |
| `(tabs)/index` | Home: signed out, a welcome and businesses to browse; signed in, next visit, upcoming jobs, book again |
| `(tabs)/explore` | Search businesses by name, service, town or trade |
| `(tabs)/jobs` | Upcoming and past jobs (signed in) |
| `(tabs)/account` | Profile (tap the avatar to add or change your photo), sign out, delete account, help |
| `welcome` | First launch only: three intro panels, then sign in or browse (`src/data/intro.ts` remembers it per device) |
| `setup` | After a first sign-in: name and phone, home address, then "you're all set" (and how many bookings we found). Skippable; Home offers it until done |
| `sign-in` | Email, then the emailed code (modal). Creates the account on first use |
| `business/[slug]` | A business's profile: services, hours, policies |
| `book/[slug]` | Booking flow (modal): services, day and time, details, address, notes, summary |
| `job/[id]` | A job: when and where, what's booked, payments, reschedule or cancel |
| `reschedule/[id]` | Move a job to another open time (modal) |
| `edit-details` | Name, phone and home address (modal) |
| `design-system` | Every design-system component as it renders (Account › Design system) |

## Design system

`src/design-system` is the website's look rebuilt in React Native. Screens import from `@/design-system` and shouldn't need raw colors, font names or magic numbers.

- **Tokens** (`tokens.ts`): a one-to-one copy of the palette, radii and shadows in `apps/swathbook-web/src/app/globals.css`. If you change one, change the other.
- **Type** (`typography.ts`): Bricolage Grotesque for headings, Instrument Sans for copy, JetBrains Mono for labels. These are the same Google Fonts the website uses, loaded by `useBrandFonts`.
- **Components**: `Text`, `Button`, `IconButton`, `Card`, `PressableCard`, `CardTitle`, `Stat`, `Badge`, `Chip`, `TextField`, `SearchField`, `FormMessage`, `EmptyState`, `PageHeader`, `SectionHeader`, `Eyebrow`, `ListGroup`, `ListRow`, `SegmentedTabs`, `OptionCard`, `StepProgress`, `PageDots`, `Avatar`, `Logo`, `LogoMark`, `BrandPin`, `MapGrid`, `Screen`, `ScreenFooter`, `TabBar`, `Rise`.

App-specific pieces built from those (job and business cards, status badge, address fields, the open-time picker) live in `src/components`.

## Accounts

A customer account is an ordinary Supabase Auth user, signed in by an emailed code (`src/data/auth.tsx`). Their jobs are the bookings, at any business, made with their **confirmed** login email. So bookings made on the website before they installed the app show up too, and nobody sees a booking without proving they own its email. Sessions live in the iOS Keychain / Android Keystore (`src/lib/device-storage.ts`; localStorage on the web build).

## Data

Screens only use the hooks in `src/data/api.ts` (TanStack Query). Everything personal is cached under the `['me']` key and dropped on sign-out.

| What | How |
| --- | --- |
| Search, trades | `search_businesses`, `business_trades` (anyone) |
| A business, open times | `get_booking_page`, `get_available_slots` (anyone) |
| My jobs, one job, prefill | `my_bookings`, `my_booking`, `my_details` (signed in) |
| Times to move a job to | `my_reschedule_slots` (signed in) |
| Profile photo | Uploaded straight to the private `avatars` bucket (`<user_id>/<file>`, only you can use your folder), then `set_my_avatar`, which checks the file is yours; shown through a signed URL (`useAvatarUrl`). Picked, cropped square and shrunk to 512px in `src/lib/photo.ts`. Deleting the account removes the files |
| Name, phone, home address, setup state | `save_my_details`, `finish_my_setup` (signed in). The home address lives in `customer_profiles`, readable only by its owner (teammates can read `profiles`, so it doesn't go there) |
| Book | `POST /api/app/bookings` on the web app (geocodes, checks the service area, emails right away) |
| Reschedule, cancel | `POST /api/app/bookings/:id/reschedule`, `…/cancel` |
| Delete account | `DELETE /api/app/account` |
| Pay a deposit or balance | The booking's web page (`/booking/<token>`), opened in an in-app browser; Stripe's payment form lives there |

The database functions are in `supabase/migrations/20261110000100_customer_app.sql` and `20261111000100_customer_onboarding.sql`, with tests in `supabase/tests/database/customer_app.test.sql` and `customer_onboarding.test.sql`. Types come from `pnpm db:types` at the repo root, which writes the web app's `database.types.ts`; `src/data/database.types.ts` re-exports it.

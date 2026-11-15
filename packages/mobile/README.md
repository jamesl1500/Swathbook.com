# @swathbook/mobile

Code shared by the two Expo apps, `apps/swathbook-client-app` (customers) and `apps/swathbook-owner-app` (businesses):

| Import | What it is |
| --- | --- |
| `@swathbook/mobile/design-system` | The website's look in React Native: tokens, type, and components (`Button`, `Card`, `Screen`, …) |
| `@swathbook/mobile/device-storage` | Session storage in the iOS Keychain / Android Keystore (localStorage on web) |
| `@swathbook/mobile/url` | Which server URLs an app may use (HTTPS only in release builds) |
| `@swathbook/mobile/format` | Money, durations and times in a business's time zone |
| `@swathbook/mobile/status`, `booking-status` | Booking status labels (plain) and the status badge |
| `@swathbook/mobile/query-state` | Loading and load-error states |
| `@swathbook/mobile/trades`, `confirm`, `use-debounced-value` | Small helpers |

It ships TypeScript source; each app's Metro config resolves this package's own imports (React, React Native, Expo) from the app itself, so there is only ever one copy of each at runtime. Native packages are peer dependencies: an app that imports the design system needs them installed (`pnpm exec expo install <package>` in that app).

Checks: `pnpm test` and `pnpm typecheck` in this folder.

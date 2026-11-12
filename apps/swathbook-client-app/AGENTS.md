This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

This app is a member of the repo's pnpm workspace (isolated installs, supported since SDK 54). Never run `npm install` here or add a `package-lock.json`; the Expo CLI detects the workspace and uses pnpm itself.

```bash
pnpm exec expo install <package>  # ALWAYS use instead of pnpm add — resolves SDK-compatible versions
pnpm exec expo start              # start the dev server
pnpm exec expo lint               # lint
pnpm exec tsc --noEmit            # typecheck
pnpm exec expo-doctor             # diagnose dependency and config issues
pnpm exec expo install --fix      # fix incompatible package versions
```

`CI=1 expo start` turns off file watching, so the server keeps serving the code it started with. Restart it after edits.

## Design system

- Build screens from `@/design-system` (the website's look in React Native). Don't add raw hex colors, font names or one-off font sizes in screens; add a token or a variant instead.
- `tokens.ts` mirrors `apps/swathbook-web/src/app/globals.css`. Keep them in step.
- Anything that can sit inside `<Link asChild>` must give its Pressable a single flat `style` object (`StyleSheet.flatten`), never an array or a `({ pressed }) => …` function. On web, Link's Slot drops those and the element renders unstyled. Track pressed state with `usePressed`.
- Never toggle `transform` between an array and `undefined`/`null` (e.g. on press). The removal reaches native as `null` and crashes `processTransform`. Keep the array and change its values instead.
- Light-only, like the website (`userInterfaceStyle: "light"`).
- `src/app/design-system.tsx` shows every component. Add new ones there.

## Data

- Screens only use the hooks in `src/data/api.ts`. Reads are Supabase RPCs as the signed-in customer; changes go through the web app's `/api/app/*` routes (bearer token). Don't write tables directly from the app; your own details go through `save_my_details`.
- A customer's bookings are matched by their **confirmed** login email (`private.current_customer_email()`); every customer-facing function must check ownership through `private.my_booking_row()`.
- Never put secrets in `EXPO_PUBLIC_*` vars: they ship inside the app.
- Regenerate types with `pnpm db:types` at the repo root after schema changes (writes both apps' `database.types.ts`).

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

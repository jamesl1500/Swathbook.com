import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the app's plain TypeScript (job rules, notification wording,
 * booking views). Screens are checked by `pnpm typecheck` and by hand.
 */
export default defineConfig({
  resolve: {
    alias: { '@': `${import.meta.dirname}/src` },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});

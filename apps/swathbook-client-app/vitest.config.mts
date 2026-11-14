import { defineConfig } from 'vitest/config';

/**
 * Unit tests for the app's plain TypeScript (formatting, URL rules, device
 * storage). Native modules are mocked per test; screens are checked by hand
 * in Expo Go and by `pnpm exec tsc --noEmit`.
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

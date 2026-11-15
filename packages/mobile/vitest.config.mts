import { defineConfig } from 'vitest/config';

/** Unit tests for the shared plain TypeScript; native modules are mocked per test. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});

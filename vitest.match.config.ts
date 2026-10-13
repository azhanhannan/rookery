import { defineConfig } from 'vitest/config';

// Bot-vs-bot strength matches (Phase 2 acceptance). Slow, so kept out of `npm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/match/**/*.test.ts'],
    testTimeout: 30 * 60_000,
  },
});

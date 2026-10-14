import { defineConfig } from 'vitest/config';

// Server tests: real PostgreSQL (embedded, started once in globalSetup), Fastify via app.inject.
// Files share one database, so they run one at a time and each test resets the tables.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/server/**/*.test.ts'],
    globalSetup: ['tests/server/globalSetup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});

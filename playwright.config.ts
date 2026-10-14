import { defineConfig } from '@playwright/test';

// E2E runs its own API server on 5182 with a throwaway database, and a Vite dev server proxying to it.
const E2E_API = 'http://127.0.0.1:5182';

export default defineConfig({
  testDir: 'tests/e2e',
  // The first test also pays for Vite's cold compile.
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5180',
    // Uses the installed Chrome, so no Playwright browser download is needed.
    channel: 'chrome',
  },
  webServer: [
    {
      command: 'npm run server:start',
      url: `${E2E_API}/api/health`,
      // Fake Google: "Continue with Google" signs in as a made-up user without leaving the app.
      env: { PORT: '5182', ROOKERY_EPHEMERAL_DB: '1', ROOKERY_FAKE_GOOGLE: '1' },
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    },
    {
      command: 'npm run dev -- --port 5180 --strictPort',
      url: 'http://localhost:5180',
      env: { ROOKERY_API: E2E_API },
      reuseExistingServer: true,
    },
  ],
});

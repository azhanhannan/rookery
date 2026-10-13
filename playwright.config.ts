import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  // The first test also pays for Vite's cold compile.
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5180',
    // Uses the installed Chrome, so no Playwright browser download is needed.
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run dev -- --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
  },
});

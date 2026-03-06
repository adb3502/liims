import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3080',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    // Reuse authenticated session across all tests — avoids repeated logins
    // hitting the in-memory rate limiter. Session state is written by the
    // global setup script before any test runs.
    storageState: './e2e/auth-state.json',
  },
  outputDir: './e2e/test-results',
  // Global setup: log in once and save session state
  globalSetup: './e2e/global-setup.ts',
});

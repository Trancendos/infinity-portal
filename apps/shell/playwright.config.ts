/**
 * Infinity Portal — Playwright E2E Configuration
 * ────────────────────────────────────────────────
 * Run:  npx playwright test
 * UI:   npx playwright test --ui
 * Debug: npx playwright test --debug
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI
    ? [['html', { open: 'never' }], ['github'], ['list']]
    : [['html', { open: 'on-failure' }], ['list']],

  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: CI ? 'on-first-retry' : 'off',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  /* Browser matrix */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    /* Mobile viewports */
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],

  /* Dev server — auto-start Vite if not already running */
  webServer: {
    command: 'npx vite --port 5173',
    port: 5173,
    reuseExistingServer: !CI,
    timeout: 60_000,
  },
});
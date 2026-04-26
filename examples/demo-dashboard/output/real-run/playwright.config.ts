// Copyright (c) 2026 Chu Ling
// SPDX-License-Identifier: Apache-2.0
// Playwright config for demo-dashboard /login real-run.
// Target server must already be running at http://localhost:3737.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['spec.ts'],
  fullyParallel: false,    // sequential — prevents rate-limit bucket bleed
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:3737',
    trace: 'off',
    screenshot: 'off',     // we capture manually via captureEvidence()
    video: 'off',
    // No webServer block — server is started separately (background process)
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  reporter: [
    ['list'],
    [
      './playwright-junit-reporter.ts',
      {
        outputFile:
          process.env['PLAYWRIGHT_JUNIT_OUTPUT_NAME'] ?? 'test-results/results.xml',
      },
    ],
  ],
  projects: [
    {
      name: 'sys',
      testMatch: 'sys/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'crs',
      testMatch: 'crs/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

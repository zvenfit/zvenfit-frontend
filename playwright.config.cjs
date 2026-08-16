'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const { defineConfig, devices } = require('@playwright/test');

const EXPECTED_ORIGIN = 'https://staging.zvenfit.ru';
const requestedBaseUrl = process.env.STAGING_BASE_URL || EXPECTED_ORIGIN;
const baseUrl = new URL(requestedBaseUrl);

if (baseUrl.origin !== EXPECTED_ORIGIN || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash) {
  throw new Error(`Playwright E2E is restricted to ${EXPECTED_ORIGIN}`);
}

const username = process.env.STAGING_BASIC_AUTH_USERNAME || '';
const password = process.env.STAGING_BASIC_AUTH_PASSWORD || '';

if (!username || !password) {
  throw new Error('STAGING_BASIC_AUTH_USERNAME and STAGING_BASIC_AUTH_PASSWORD are required');
}

module.exports = defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: EXPECTED_ORIGIN,
    httpCredentials: { username, password },
    userAgent: 'ZvenFit-Playwright-E2E/1.0',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

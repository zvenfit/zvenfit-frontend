'use strict';

/* eslint-disable @typescript-eslint/no-var-requires */

const { expect, test } = require('@playwright/test');

const STAGING_ORIGIN = 'https://staging.zvenfit.ru';

test.describe.configure({ mode: 'serial' });

test('rejects unauthenticated access at the gateway', async ({ playwright }) => {
  const anonymous = await playwright.request.newContext({
    baseURL: STAGING_ORIGIN,
    userAgent: 'ZvenFit-Playwright-E2E/1.0',
  });

  try {
    const response = await anonymous.get('/');
    expect(response.status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});

test('serves an authenticated noindex build without production analytics', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/ZvenFit/i);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/i);
  await expect(page.locator('script[src*="googletagmanager.com"]')).toHaveCount(0);
  await expect(page.locator('script[src*="mc.yandex.ru"]')).toHaveCount(0);
});

test('renders the isolated synthetic schedule', async ({ page }) => {
  const response = await page.goto('/raspisanie/');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /расписание занятий/i })).toBeVisible();

  const schedule = page.locator('[data-schedule-root]');
  await expect(schedule.locator('.schedule-state--error')).toHaveCount(0);
  await expect(schedule.locator('.schedule-event').first()).toBeVisible({ timeout: 20_000 });
  await expect(schedule.getByText('Тест: групповая тренировка', { exact: true })).toBeVisible();
});

test('blocks an invalid lead in the browser without calling the API', async ({ page }) => {
  let leadRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/lead') {
      leadRequests += 1;
    }
  });

  const response = await page.goto('/forma-dlya-zayavki/');
  expect(response?.status()).toBe(200);

  const name = page.getByLabel('Имя', { exact: true });
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();

  expect(await name.evaluate(element => element.matches(':invalid'))).toBe(true);
  expect(leadRequests).toBe(0);
});

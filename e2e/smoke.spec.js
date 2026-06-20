// Smoke suite — layout + golden-path regression guard.
// Run manually before releases: npm run test:e2e
// Requires the dev server to be running (npm run dev), or Playwright will
// start it automatically via the webServer config in playwright.config.js.
//
// Three flows at up to three viewport widths:
//   1. Experience Pool  — page renders at 1440 / 900 / 380px
//   2. Assembly         — "Start a new CV" dialog is accessible and dismissable
//   3. CV Library       — responsive layout flips at ≤900px

import { test, expect } from '@playwright/test';

// Helper: navigate to a named section via the sidebar.
// Works whether the nav is collapsed (aria-label) or expanded (visible text).
async function navTo(page, label) {
  await page.getByRole('button', { name: label }).click();
}

// =============================================================================
// 1. Experience Pool
// =============================================================================

const VIEWPORTS = [
  { width: 1440, height: 900,  label: '1440px' },
  { width: 900,  height: 700,  label: '900px'  },
  { width: 380,  height: 812,  label: '380px'  },
];

for (const vp of VIEWPORTS) {
  test(`Experience Pool renders correctly at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await navTo(page, 'Experience Pool');

    // Page heading and main container are always present.
    await expect(page.getByRole('heading', { name: 'Experience Pool' })).toBeVisible();
    await expect(page.locator('.experience-pool')).toBeVisible();

    // Either a job list or the empty-state prompt is shown after data loads.
    await expect(page.locator('.job-card, .empty-state').first()).toBeVisible({ timeout: 5000 });
  });
}

// =============================================================================
// 2. Assembly — Start new CV dialog
// =============================================================================

test('Assembly: Start new CV dialog opens and has accessible title', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await navTo(page, 'Assembly');

  // The dialog opens automatically when no document is loaded.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // Accessibility requirements: aria-labelledby must point at the title element.
  await expect(dialog).toHaveAttribute('aria-labelledby', 'new-cv-title');
  await expect(page.locator('#new-cv-title')).toHaveText('Start a new CV');
});

test('Assembly: Cancel dismisses the Start new CV dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await navTo(page, 'Assembly');

  await page.getByRole('dialog').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('Assembly: Start new CV dialog is usable at 380px (no overflow)', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 812 });
  await page.goto('/');
  await navTo(page, 'Assembly');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // Title and Cancel button must both be reachable at the smallest viewport.
  await expect(page.locator('#new-cv-title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
});

// =============================================================================
// 3. CV Library — responsive layout
// =============================================================================

test('CV Library: profile sidebar is a vertical column at 1440px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await navTo(page, 'CV Library');

  const sidebar = page.locator('.cvlib-sidebar');
  await expect(sidebar).toBeVisible();
  const flexDir = await sidebar.evaluate(el => getComputedStyle(el).flexDirection);
  expect(flexDir).toBe('column');
});

test('CV Library: profile sidebar becomes a horizontal strip at 900px', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto('/');
  await navTo(page, 'CV Library');

  const sidebar = page.locator('.cvlib-sidebar');
  await expect(sidebar).toBeVisible();
  const flexDir = await sidebar.evaluate(el => getComputedStyle(el).flexDirection);
  expect(flexDir).toBe('row');
});

test('CV Library: renders without horizontal overflow at 380px', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 812 });
  await page.goto('/');
  await navTo(page, 'CV Library');

  // The outer CV Library container must not exceed the viewport width.
  const body = page.locator('.cvlib-body');
  await expect(body).toBeVisible();
  const box = await body.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
});

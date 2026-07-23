#!/usr/bin/env node
/**
 * Automated UI screenshots for the README, driven by Playwright (reusing the
 * backend's dependency — no extra install). Both apps must be running first.
 *
 * Usage:
 *   node scripts/screenshots.mjs
 *
 * Env:
 *   SCREENSHOT_BASE_URL  Frontend origin (default http://localhost:35173)
 *   ADMIN_PASSWORD       Enables the admin-console shots (login + settings)
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve playwright from the backend workspace package, where it lives.
const require = createRequire(
  new URL('../backend/package.json', import.meta.url),
);
const { chromium } = require('playwright');

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(rootDir, 'docs', 'screenshots');
const baseUrl = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:35173';
const adminPassword = process.env.ADMIN_PASSWORD ?? '';

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});

async function shot(name, options = {}) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: options.fullPage ?? false });
  console.log(`✔ ${path.relative(rootDir, file)}`);
}

const tripKeyword = process.env.SCREENSHOT_TRIP_KEYWORD ?? '京都賞楓五日深度旅遊';

try {
  // Home — trip planner
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await shot('home');

  // Trip result — submit a keyword and wait for the itinerary. With a recent
  // finished job for the same keyword this hits the backend cache and renders
  // in seconds; otherwise it runs the full pipeline (searching + crawling +
  // LLM), hence the generous timeout.
  await page.fill('input[placeholder*="例如"]', tripKeyword);
  await page.click('button[type="submit"]');
  try {
    await page.waitForSelector('text=Day 1', { timeout: 300_000 });
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.waitForTimeout(1000); // let entry animations settle
    await shot('trip-result');
    await page.setViewportSize({ width: 1440, height: 900 });
  } catch {
    console.warn('⚠ itinerary did not render in time — skipping trip-result');
  }

  // Admin login page
  await page.goto(`${baseUrl}/admin/login`, { waitUntil: 'networkidle' });
  await shot('admin-login');

  if (adminPassword) {
    // Log in through the real form, then capture the settings console.
    await page.fill('#admin-password', adminPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/settings');
    // The table loads client-side after navigation; wait for real rows so the
    // shot doesn't capture the "loading" placeholder.
    await page
      .waitForSelector('td >> text=trip.targetDocuments', { timeout: 15000 })
      .catch(() => console.warn('⚠ settings rows did not appear in time'));
    await shot('admin-settings', { fullPage: true });
  } else {
    console.warn('⚠ ADMIN_PASSWORD not set — skipping admin console shots');
  }
} finally {
  await browser.close();
}

// Visual-parity snapshot test for the weather widget. Renders the legacy
// WeatherWidget alongside the new declarative widget at 2x2 / 4x2 / 4x4
// from the snapshot harness and saves PNGs to the workspace so we can
// iterate on the declarative manifest until they match.
//
// Run: npx playwright test e2e/weather-snapshot.spec.ts
//
// Outputs land under: nexus-web/.snapshots/weather/<variant>-<size>.png

import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SIZES: Array<'2x2' | '4x2' | '4x4'> = ['2x2', '4x2', '4x4'];

const SHOT_DIR = join(process.cwd(), '.snapshots', 'weather');

test.describe('weather widget snapshot harness', () => {
  test.beforeAll(() => {
    mkdirSync(SHOT_DIR, { recursive: true });
  });

  test('renders legacy and declarative side-by-side and captures PNGs', async ({ page }) => {
    await page.goto('/snapshot-harness');
    // Wait for the harness to actually mount.
    await page.waitForSelector('[data-snap="legacy-2x2"]');
    await page.waitForSelector('[data-snap="declarative-2x2"]');
    // Give layout + fonts a beat to settle (no useful network here, but the
    // browser caches its font load asynchronously).
    await page.waitForTimeout(250);

    for (const size of SIZES) {
      for (const variant of ['legacy', 'declarative'] as const) {
        const sel = `[data-snap="${variant}-${size}"]`;
        const handle = await page.waitForSelector(sel);
        const out = join(SHOT_DIR, `${variant}-${size}.png`);
        await handle.screenshot({ path: out, omitBackground: false });
      }
    }
  });
});

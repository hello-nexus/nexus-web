import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// LIVE bench verification against a real Nexus service with a real Keeb TKL
// attached. Not part of CI - runs only when pointed at a live stack:
//   KEEB_LIVE_BASE  - dev-server origin serving this branch's web bundle
//                     (vite with VITE_SERVICE_HOST=<bench ip>)
//   KEEB_LIVE_TOKEN - service token (loopback /pair on the bench)
// Reads broadly; the only writes are a no-op settings round-trip (posting the
// values already persisted) and a key-assignment attempt that the service is
// expected to REJECT (the layer-key endpoints don't exist yet) - verifying
// the honest-failure toast against a real 404.

const BASE = process.env.KEEB_LIVE_BASE;
const TOKEN = process.env.KEEB_LIVE_TOKEN;
const SCREENSHOT_DIR = join(process.cwd(), '.deep-build', 'screenshots');

test.use({ viewport: { width: 1280, height: 850 } });

test.beforeAll(async () => {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
});

test('keeb page works against the live service and hardware', async ({ page }) => {
  test.skip(!BASE || !TOKEN, 'live bench env not set');
  await page.addInitScript(token => {
    localStorage.setItem('nexus_token', token as string);
  }, TOKEN);

  page.on('pageerror', err => console.log('[pageerror]', err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[console]', msg.text().slice(0, 200));
  });

  await page.goto(`${BASE}/`);
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-live-00-debug.png') });

  const sidebar = page.locator('[class*="sidebarColumn"]');
  await expect(sidebar).toBeVisible({ timeout: 15_000 });
  const keebBtn = sidebar.locator('button[aria-label="Keeb"], button:has-text("Keeb")').first();
  await expect(keebBtn).toBeVisible({ timeout: 15_000 });
  await keebBtn.click();

  // Online title (tablist carries it) - the REAL device is attached.
  await expect(page.getByRole('tab', { name: 'Key Assignment' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('(offline)')).toHaveCount(0);
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-live-01-assignment.png') });

  // Honest-failure path against the real service: the layer-key endpoint
  // does not exist there yet, so assigning must toast and revert.
  await page.locator('button[title="F1"]').first().click();
  await page.getByRole('tab', { name: 'Mouse' }).click();
  await page.getByRole('radio', { name: 'Left Click' }).click();
  const failToast = page.getByText('Keyboard change failed');
  await expect(failToast).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-live-02-failure-toast.png') });
  // Dismiss before the settings step so a lingering toast can't false-flag
  // the no-op round-trip below.
  await failToast.click();
  await expect(failToast).toHaveCount(0, { timeout: 10_000 });

  // Settings tab renders the values persisted on the bench, then a no-op
  // round-trip write (same values back) exercises the live 0x06 path.
  await page.getByRole('tab', { name: 'Settings' }).click();
  const effect = page.getByLabel('Effect');
  await expect(effect).toBeVisible({ timeout: 10_000 });
  const persisted = await effect.inputValue();
  expect(persisted.length).toBeGreaterThan(0);
  await effect.selectOption(persisted);
  await expect(page.getByText('Keyboard change failed')).toHaveCount(0);
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-live-03-settings.png') });

  // Macros tab shows whatever the bench has in slot 1 (read-only here).
  await page.getByRole('tab', { name: 'Macros' }).click();
  await expect(page.getByRole('button', { name: 'Start Recording' })).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-live-04-macros.png') });
});

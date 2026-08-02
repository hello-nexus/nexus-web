import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// UI test for the Keeb device page - boots the dashboard with a mocked
// connected Keeb TKL, walks every tab (key assignment incl. key + wheel
// selection, macros, tester, settings), and captures screenshots into
// `.deep-build/screenshots/`. Also asserts the load-bearing UI of each tab
// so it doubles as an e2e smoke test for the keeb surface.

const SCREENSHOT_DIR = join(process.cwd(), '.deep-build', 'screenshots');

test.use({
  viewport: { width: 1600, height: 1000 },
});

const KEEB_SETTINGS = {
  error: false,
  shiftKeyDisabled: false,
  windowsKeyDisabled: true,
  altF4Disabled: false,
  altTabDisabled: false,
  animationMode: 'Rainbow',
  speed: 'Standard',
  direction: 'LeftToRight',
  brightness: 80,
  keyIndicator: false,
  keyReactive: true,
  keyReactiveMask: false,
  keyReactiveMode: 'SingleKey',
  keyReactiveColor: { r: 59, g: 130, b: 246, a: 255 },
};

const ROTARY_FUNCTIONS = [
  'VolumeAdjustment', 'BrightnessAdjustment', 'Scale', 'AltTab', 'CtrlTab',
  'ScrollX', 'ScrollY', 'WaveAdjustment', 'ScrubAdobeTimeline',
  'ScrollAdobeTimeline', 'AdobeBrushSize', 'ScrollAdobeToolList',
  'MediaForwardsOrBackwards', 'UndoOrRedo', 'Q60PageControl', 'Y70PageControl',
];

async function mockService(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('nexus_token', 'test-token');
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => undefined,
      });
    }
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('light') ? false : true,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  });
  await page.route('**/sw.js', route => route.fulfill({ status: 404, body: '' }));
  await page.route('http://localhost:9400/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/ping') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ service: 'nexus', version: 'test', initialized: true, platform: 'windows' }) });
      return;
    }
    if (path === '/pair') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test-token' }) });
      return;
    }
    if (path === '/profiles') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [{ id: 'default', name: 'Default', createdAt: '', updatedAt: '' }], activeId: 'default' }) });
      return;
    }
    if (path === '/preferences') {
      if (request.method() === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: false }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          theme: { language: 'en', themeMode: 'dark', accentColor: '#3b82f6' },
          panel: { autoLaunch: false, themeSyncWithDesktop: true, themeMode: 'dark', accentSyncWithDesktop: true, backgroundMode: 'solid', backgroundEffect: 'none', backgroundTemplate: 0, backgroundOpacity: 1, widgetOpacity: 1, widgetLabels: true },
          overlay: { enabled: false, alwaysOnTop: false, scale: 1, opacity: 1, monitor: 0, layout: [] },
          monitoring: { showMacStatusBarIcon: true, showWindowsTrayIcon: true, detailedCollapsed: [] },
          cooling: {},
          ui: { showConflictAlerts: true, pinnedSidebarApps: ['monitoring', 'lighting', 'cooling'] },
        }),
      });
      return;
    }
    if (path === '/devices/all') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'keeb', name: 'HYTE Keeb TKL', category: 'keyboard', connected: true, firmwareVersion: '1.33' },
        ]),
      });
      return;
    }
    if (path.startsWith('/keeb/state') || path.match(/^\/keeb\/layer\/\d+$/)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ isConnected: true, profile: 0, layer: 0, layout: 'ANSI', keys: [] }),
      });
      return;
    }
    if (path === '/keeb/settings') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KEEB_SETTINGS) });
      return;
    }
    if (path === '/keeb/rotary/functions') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: false, functions: ROTARY_FUNCTIONS }) });
      return;
    }
    if (path.match(/^\/keeb\/macro\/\d+$/)) {
      const index = Number(path.split('/').pop());
      const keys = index === 0
        ? [
          { key: 'KeyH', duration: 10, type: 'Make', category: 'StandardKey' },
          { key: 'KeyH', duration: 60, type: 'Break', category: 'StandardKey' },
          { key: 'KeyI', duration: 10, type: 'Make', category: 'StandardKey' },
          { key: 'KeyI', duration: 40, type: 'Break', category: 'StandardKey' },
        ]
        : [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: false, macro: { index, keys } }) });
      return;
    }
    if (path === '/panel/devices') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ devices: [] }) });
      return;
    }
    if (path === '/cooling/status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ calibrating: false, calibrationState: 'idle', activeCurves: 0, fanCount: 0, manualFans: 0, activeCurveFanCount: 0 }) });
      return;
    }
    if (path === '/lighting/status') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ effect: '', running: false, scanning: false }) });
      return;
    }
    if (path === '/apps-api/listings') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ listings: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

test.beforeAll(async () => {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
});

test('walks every Keeb page tab', async ({ page }) => {
  page.on('pageerror', err => console.log('[pageerror]', err.message));

  await mockService(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  const sidebar = page.locator('[class*="sidebarColumn"]');
  await expect(sidebar).toBeVisible({ timeout: 10_000 });

  const keebBtn = sidebar.locator('button[aria-label="Keeb"], button:has-text("Keeb")').first();
  await expect(keebBtn).toBeVisible({ timeout: 10_000 });
  await keebBtn.click();
  await page.waitForTimeout(1000);

  // Key Assignment (default tab): keyboard stage + hint until a key is picked.
  await expect(page.getByRole('tab', { name: 'Key Assignment' })).toBeVisible();
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-01-assignment-initial.png') });

  // Pick the F1 key on the main keyboard (title carries the function name),
  // then open the Mouse category so the tile grid renders enabled.
  await page.locator('button[title="F1"]').first().click();
  await page.getByRole('tab', { name: 'Mouse' }).click();
  await page.waitForTimeout(300);
  await expect(page.getByRole('radio', { name: 'Left Click' })).toBeEnabled();
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-02-assignment-mouse.png') });

  // Wheel selection swaps the body to the rotary editor.
  await page.getByRole('button', { name: 'Left rotary wheel' }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText('Editing: Left Wheel')).toBeVisible();
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-03-rotary.png') });

  // Macros: slot 1 carries the mocked Hi recording.
  await page.getByRole('tab', { name: 'Macros' }).click();
  await page.waitForTimeout(500);
  await expect(page.getByRole('button', { name: 'Start Recording' })).toBeVisible();
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-04-macros.png') });

  // Tester: local mode card + empty history.
  await page.getByRole('tab', { name: 'Tester' }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText('Local Mode')).toBeVisible();
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-05-tester.png') });

  // Settings: three sections on SettingRows.
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText('Firmware Lighting')).toBeVisible();
  await expect(page.getByText('Game Mode')).toBeVisible();
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-06-settings.png') });
});

test.describe('small window', () => {
  test.use({ viewport: { width: 1100, height: 720 } });

  test('keyboard and grids fit without horizontal overflow', async ({ page }) => {
    await mockService(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    const sidebar = page.locator('[class*="sidebarColumn"]');
    await expect(sidebar).toBeVisible({ timeout: 10_000 });
    const keebBtn = sidebar.locator('button[aria-label="Keeb"], button:has-text("Keeb")').first();
    await expect(keebBtn).toBeVisible({ timeout: 10_000 });
    await keebBtn.click();
    await page.waitForTimeout(1000);

    const overflow = () => page.evaluate(() => {
      const doc = document.scrollingElement!;
      return doc.scrollWidth - doc.clientWidth;
    });
    // The keyboard chassis itself must fit its stage - page-level overflow
    // alone misses a board clipped inside a non-scrolling wrapper. Walk
    // wrap > stage > chassis structurally; class-substring matching is
    // ambiguous here (every hashed class in the chain contains "keyboard").
    const keyboardOverhang = () => page.evaluate(() => {
      const wrap = document.querySelector('[class*="keyboardStageWrap"]') as HTMLElement | null;
      const board = wrap?.firstElementChild?.firstElementChild as HTMLElement | null;
      if (!wrap || !board) return null;
      return board.getBoundingClientRect().width - wrap.getBoundingClientRect().width;
    });

    await expect(page.getByRole('tab', { name: 'Key Assignment' })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(await keyboardOverhang()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-07-small-assignment.png') });

    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.waitForTimeout(300);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'keeb-08-small-settings.png') });
  });
});

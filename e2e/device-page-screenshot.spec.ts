import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// One-shot UI test for the device pages — boots the dashboard with a
// simulated Y70 + Q60 + Q80 attached, navigates into each device's
// page, and captures screenshots into `.deep-build/screenshots/`.
//
// Not part of the regular CI run; it's run manually as part of the
// device-page-scale deep-build session to verify the layout matches
// the modal it replaced. Iterate the SCSS, re-run, compare.

const SCREENSHOT_DIR = join(process.cwd(), '.deep-build', 'screenshots');

test.use({
  // Wide viewport so the dashboard sidebar renders expanded (not the
  // compact icon-only mode that kicks in below 1199px) — we need the
  // device row labels visible to click them.
  viewport: { width: 1600, height: 1000 },
});

interface PanelDeviceDto {
  id: string;
  sourceId?: string;
  name: string;
  subtitle?: string;
  status?: string;
}

async function mockService(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('nexus_token', 'test-token');
    // Connect the simulated Y70 + Q60 panels so they appear in the
    // unified device list without needing actual hardware.
    localStorage.setItem('nexus_simulated_panel_ids', JSON.stringify(['y70', 'q60']));
    localStorage.setItem('nexus_simulate_y70', '1');
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => undefined,
      });
    }
    // jsdom-style mock of matchMedia so the auto-collapse threshold +
    // theme detection don't crash on undefined.addEventListener.
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ service: 'nexus', version: 'test', initialized: true, platform: 'macos' }),
      });
      return;
    }
    if (path === '/pair') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test-token' }) });
      return;
    }
    if (path === '/profiles') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profiles: [{ id: 'default', name: 'Default', createdAt: '', updatedAt: '' }],
          activeId: 'default',
        }),
      });
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
          // autoLaunch: true so the simulator's "panel hidden / desktop visible"
          // overlay doesn't replace the actual canvas in the preview pane —
          // we want the canvas in the screenshot, not the offline placeholder.
          panel: { autoLaunch: true, themeSyncWithDesktop: true, themeMode: 'dark', accentSyncWithDesktop: true, backgroundMode: 'solid', backgroundEffect: 'none', backgroundTemplate: 0, backgroundOpacity: 1, widgetOpacity: 1, widgetLabels: true },
          overlay: { enabled: false, alwaysOnTop: false, scale: 1, opacity: 1, monitor: 0, layout: [] },
          monitoring: { showAverage: true, showMacStatusBarIcon: true, showWindowsTrayIcon: true, detailedCollapsed: [] },
          cooling: {},
          ui: { disableConflictAlerts: false, pinnedSidebarApps: ['monitoring', 'lighting', 'cooling'] },
        }),
      });
      return;
    }
    if (path === '/defaults' || path === '/defaults/snapshot') {
      // Minimal InstallDefaultsDocument so preloadInstallDefaults() resolves;
      // everything we don't drive in the test gets empty/default values.
      const emptyLayout = (surface: string) => ({ layoutSchemaVersion: 2, surface, widgets: [] });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          theme: { language: 'en', themeMode: 'dark', accentColor: '#3b82f6' },
          monitoring: { showAverage: true, showMacStatusBarIcon: true, showWindowsTrayIcon: true },
          panel: {
            autoLaunch: false, themeSyncWithDesktop: true, themeMode: 'dark', accentSyncWithDesktop: true,
            backgroundMode: 'solid', backgroundEffect: 'none', backgroundTemplate: 0,
            backgroundOpacity: 1, widgetOpacity: 1, widgetLabels: true,
            layouts: {
              desktop: emptyLayout('desktop'),
              y70: emptyLayout('y70'),
              phone: emptyLayout('phone'),
              q60: emptyLayout('q60'),
            },
          },
          overlay: { enabled: false, alwaysOnTop: false, scale: 1, opacity: 1, monitor: 0 },
          lighting: { sync: 'none', brightnessEnabled: false, speedEnabled: false, frameRate: 60, scaleRatio: 1, musicReactive: false, staticColor: { r: 0, g: 0, b: 0 }, animate: { effect: '', state: { speed: 0, intensity: 0, hue: 0, colorize: 0, saturation: 0, contrast: 0 } }, postProcess: { hue: 0, colorize: 0, saturation: 0, contrast: 0 }, devicePreference: { brightness: 100, saturation: 100 } },
          y70: { orientation: 'Landscape', brightness: 80, screenOff: false },
          keeb: { rotaryLeft: '', rotaryRight: '', rotarySensitivity: '', firmwareLighting: { animationMode: '', speed: '', direction: '', brightness: 100, keyReactive: false, keyReactiveMask: false, keyReactiveMode: '' } },
          cooling: { globalSpeedModifier: 1, activePreset: '', presets: {}, deviceLayoutSize: { w: 1, h: 1 } },
          obs: { host: '', port: 0 },
          screenTime: { trackingEnabled: false },
          cnvs: { playAnimation: false, playWhenPCOff: false },
          auth: { remoteControlEnabled: true },
        }),
      });
      return;
    }
    if (path === '/devices/all') {
      // useDevices expects a bare array of DeviceListItem.
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (path === '/panel/devices') {
      // usePanelDevices reads { devices: PanelDeviceRecord[] }. The
      // simulated Y70 + Q60 panels are layered on top of this list by
      // the panelSimulation localStorage flags.
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ devices: [] }) });
      return;
    }
    if (path === '/peripherals') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ peripherals: [] }) });
      return;
    }
    if (path === '/panel/status' || path === '/panel/y70/status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // kioskRunning: true so the Y70 reads as "running" in the
        // simulator instead of showing the stopped placeholder.
        body: JSON.stringify({ msg: 'running', kioskRunning: true, phoneConnected: false, phoneSubscribers: 0 }),
      });
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
    if (path === '/y70/brightness') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ brightness: 80 }) });
      return;
    }
    if (path === '/y70/rotation') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ orientation: 'Landscape' }) });
      return;
    }
    if (path === '/y70/toggle') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ toggle: false }) });
      return;
    }
    if (path === '/widgets-api/listings') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ listings: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });
  // Anything else (CDN, fonts) — let it fall through.
}

test.beforeAll(async () => {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
});

test('captures Y70 and Q60 device pages', async ({ page }) => {
  // Surface browser console messages + page errors in the playwright output
  // so we can see what's preventing the dashboard from rendering.
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[browser ${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => console.log('[pageerror]', err.message));

  await mockService(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const bodyHtml = await page.content();
  console.log('--- body length:', bodyHtml.length);
  console.log('--- body head:', bodyHtml.slice(0, 800));
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'debug-initial.png'), fullPage: false });
  // Sidebar DEVICES section should populate from the simulated panels.
  // Click the Y70 row by name.
  const sidebar = page.locator('[class*="sidebarColumn"]');
  await expect(sidebar).toBeVisible({ timeout: 10_000 });

  // Find the Y70 button. The sidebar device rows expose aria-label =
  // shortName (when collapsed/compact) or the text node; look for both.
  await page.screenshot({ path: join(SCREENSHOT_DIR, '00-dashboard.png'), fullPage: false });

  // The device row exposes the device shortName via aria-label
  // (compact mode) and via visible text (expanded). The locator uses
  // both so the test is robust to layout mode shifts.
  const y70Btn = sidebar.locator('button[aria-label="Y70"], button:has-text("Y70")').first();
  if (await y70Btn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await y70Btn.click();
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(1500); // let PanelEmbedFrame measure + paint
    await page.screenshot({ path: join(SCREENSHOT_DIR, '01-y70.png'), fullPage: false });
  } else {
    console.warn('Y70 sidebar entry not visible — falling back to URL nav.');
    await page.goto('/system/devices');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '01-devices-landing.png'), fullPage: false });
  }

  const q60Btn = sidebar.locator('button[aria-label="Q60"], button:has-text("Q60")').first();
  if (await q60Btn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await q60Btn.click();
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SCREENSHOT_DIR, '02-q60.png'), fullPage: false });

    // Inspect a Q60 catalog card to confirm aspect-ratio applies.
    const debug = await page.evaluate(() => {
      const catalogRoot = document.querySelector('[data-surface="q60"]');
      const firstCard = catalogRoot?.querySelector('[role="button"]');
      const preview = firstCard?.querySelector('[class*="preview"]');
      const cs = preview ? getComputedStyle(preview as HTMLElement) : null;
      const rect = (preview as HTMLElement | null)?.getBoundingClientRect();
      return {
        hasCatalogRoot: !!catalogRoot,
        firstCardLabel: firstCard?.getAttribute('aria-label'),
        tileSpan: firstCard?.getAttribute('data-tile-span'),
        previewAspectRatio: cs?.aspectRatio,
        previewWidth: rect?.width,
        previewHeight: rect?.height,
      };
    });
    console.log('[q60 catalog debug]', JSON.stringify(debug, null, 2));

    // Inspect the previewPane sizing.
    const previewDbg = await page.evaluate(() => {
      const pane = document.querySelector('[class*="previewPane"][data-surface="q60"]');
      const rect = (pane as HTMLElement | null)?.getBoundingClientRect();
      const cs = pane ? getComputedStyle(pane as HTMLElement) : null;
      return {
        hasPane: !!pane,
        rectW: rect?.width,
        rectH: rect?.height,
        maxHeight: cs?.maxHeight,
        alignSelf: cs?.alignSelf,
        flex: cs?.flex,
      };
    });
    console.log('[q60 preview debug]', JSON.stringify(previewDbg, null, 2));
  }
});

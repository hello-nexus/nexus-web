import { test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const SCREENSHOT_DIR = join(process.cwd(), '..', '.deep-build', 'screenshots');

async function setupMock(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('nexus_token', 'test-token');
    localStorage.setItem('nexus_simulated_panel_ids', JSON.stringify(['y70', 'q60']));
    localStorage.setItem('nexus_simulate_y70', '1');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (q: string) => {
        const max = q.match(/max-width:\s*(\d+)px/);
        const matches = max ? window.innerWidth <= Number(max[1]) : !q.includes('light');
        return { matches, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
      },
    });
  });
  await page.route('**/sw.js', r => r.fulfill({ status: 404 }));
  await page.route('http://localhost:9400/**', async r => {
    const path = new URL(r.request().url()).pathname;
    if (path === '/ping') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ service: 'nexus', version: 'test', initialized: true, platform: 'macos' }) });
    if (path === '/pair') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'test-token' }) });
    if (path === '/profiles') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profiles: [{ id: 'default', name: 'Default', createdAt: '', updatedAt: '' }], activeId: 'default' }) });
    if (path === '/preferences') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ theme: { language: 'en', themeMode: 'dark', accentColor: '#3b82f6' }, panel: { autoLaunch: true, themeSyncWithDesktop: true, themeMode: 'dark', accentSyncWithDesktop: true, backgroundMode: 'solid', backgroundEffect: 'none', backgroundTemplate: 0, backgroundOpacity: 1, widgetOpacity: 1, widgetLabels: true }, overlay: { enabled: false, alwaysOnTop: false, scale: 1, opacity: 1, monitor: 0, layout: [] }, monitoring: { showMacStatusBarIcon: true, showWindowsTrayIcon: true, detailedCollapsed: [] }, cooling: {}, ui: { showConflictAlerts: true, pinnedSidebarApps: ['monitoring','lighting','cooling'] } }) });
    if (path === '/defaults' || path === '/defaults/snapshot') {
      const layout = (s: string) => ({ layoutSchemaVersion: 2, surface: s, widgets: [] });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ theme: { language: 'en', themeMode: 'dark', accentColor: '#3b82f6' }, monitoring: { showMacStatusBarIcon: true, showWindowsTrayIcon: true }, panel: { autoLaunch: true, themeSyncWithDesktop: true, themeMode: 'dark', accentSyncWithDesktop: true, backgroundMode: 'solid', backgroundEffect: 'none', backgroundTemplate: 0, backgroundOpacity: 1, widgetOpacity: 1, widgetLabels: true, layouts: { desktop: layout('desktop'), y70: layout('y70'), phone: layout('phone'), q60: layout('q60') } }, overlay: { enabled: false, alwaysOnTop: false, scale: 1, opacity: 1, monitor: 0 }, lighting: { sync: 'none', brightnessEnabled: false, speedEnabled: false, frameRate: 60, scaleRatio: 1, musicReactive: false, staticColor: { r: 0, g: 0, b: 0 }, animate: { effect: '', state: { speed: 0, intensity: 0, hue: 0, colorize: 0, saturation: 0, contrast: 0 } }, postProcess: { hue: 0, colorize: 0, saturation: 0, contrast: 0 }, devicePreference: { brightness: 100, saturation: 100 } }, y70: { orientation: 'Landscape', brightness: 80, screenOff: false }, keeb: { rotaryLeft: '', rotaryRight: '', rotarySensitivity: '', firmwareLighting: { animationMode: '', speed: '', direction: '', brightness: 100, keyReactive: false, keyReactiveMask: false, keyReactiveMode: '' } }, cooling: { globalSpeedModifier: 1, activePreset: '', presets: {}, deviceLayoutSize: { w: 1, h: 1 } }, obs: { host: '', port: 0 }, screenTime: { trackingEnabled: false }, cnvs: { playAnimation: false, playWhenPCOff: false }, auth: { remoteControlEnabled: true } }) });
    }
    if (path === '/devices/all') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (path === '/panel/devices') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ devices: [] }) });
    if (path === '/panel/status') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ msg: 'running', kioskRunning: true, phoneConnected: false, phoneSubscribers: 0 }) });
    if (path === '/cooling/status') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ calibrating: false, calibrationState: 'idle', activeCurves: 0, fanCount: 0, manualFans: 0, activeCurveFanCount: 0 }) });
    if (path === '/lighting/status') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ effect: '', running: false, scanning: false }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

test('sidebar in both modes', async ({ page }) => {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await setupMock(page);
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'sidebar-expanded.png'), clip: { x: 0, y: 0, width: 240, height: 700 } });
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.reload();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'sidebar-compact.png'), clip: { x: 0, y: 0, width: 100, height: 700 } });
});

import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 1440, height: 960 },
});

const MONITOR_ID = 'DEL41B7-5-abc-UID12345';
const SECONDARY_ID = 'GSM5BBF-1';
const Y70_ID = 'RTK0004-5-def-UID67890';

function topologyBody(assignedPanelDeviceId: string | null) {
  return {
    hostingSupported: true,
    rotationSupported: true,
    reserveSupported: true,
    positionsAvailable: true,
    revision: 1,
    hint: '',
    displays: [
      {
        id: MONITOR_ID,
        number: 1,
        name: 'DEL 41B7',
        manufacturer: 'DEL',
        model: '41B7',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        resolution: { width: 3840, height: 2160 },
        scaleFactor: 1.5,
        dpi: null,
        isPrimary: true,
        isInternal: false,
        isY70: false,
        hostingSupported: true,
        // Primary can't be promoted; the panel always lands on the secondary.
        assignedPanelDeviceId: null,
        assignedPanelName: null,
      },
      {
        id: SECONDARY_ID,
        number: 2,
        name: 'LG ULTRAGEAR',
        manufacturer: 'GSM',
        model: '5BBF',
        bounds: { x: 2560, y: 0, width: 1920, height: 1080 },
        resolution: { width: 1920, height: 1080 },
        scaleFactor: 1,
        dpi: null,
        isPrimary: false,
        isInternal: false,
        isY70: false,
        hostingSupported: true,
        assignedPanelDeviceId,
        assignedPanelName: assignedPanelDeviceId ? 'LG ULTRAGEAR' : null,
      },
      {
        id: Y70_ID,
        number: 3,
        name: 'Y70 Touch',
        manufacturer: 'RTK',
        model: '0004',
        bounds: { x: 4480, y: 0, width: 1100, height: 3840 },
        resolution: { width: 1100, height: 3840 },
        scaleFactor: 1,
        dpi: null,
        isPrimary: false,
        isInternal: false,
        isY70: true,
        hostingSupported: false,
        assignedPanelDeviceId: null,
        assignedPanelName: null,
      },
    ],
  };
}

async function mockService(page: Page, state: { promoted: boolean; promotePosts: string[] }) {
  await page.addInitScript(() => {
    localStorage.setItem('nexus_token', 'test-token');
    if ('serviceWorker' in navigator) {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        get: () => undefined,
      });
    }
  });
  await page.route('**/sw.js', route => route.fulfill({ status: 404, body: '' }));
  await page.route('http://localhost:9400/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (path === '/ping') {
      await json({ service: 'nexus', version: 'test', initialized: true, platform: 'windows' });
      return;
    }
    if (path === '/pair') {
      await json({ token: 'test-token' });
      return;
    }
    if (path === '/profiles') {
      await json({ profiles: [{ id: 'default', name: 'Default', createdAt: '', updatedAt: '' }], activeId: 'default' });
      return;
    }
    if (path === '/preferences') {
      await json({ language: 'en', themeMode: 'system', accentColor: '#22c55e' });
      return;
    }
    if (path === '/panel/status') {
      await json({ msg: 'stopped', kioskRunning: false, phoneConnected: false, phoneSubscribers: 0 });
      return;
    }
    if (path === '/displays/topology') {
      await json(topologyBody(state.promoted ? 'panel-record-1' : null));
      return;
    }
    if (path === `/displays/${SECONDARY_ID}/panel` && request.method() === 'POST') {
      state.promotePosts.push(path);
      state.promoted = true;
      await json({ id: 'panel-record-1', displayName: 'LG ULTRAGEAR', displayId: SECONDARY_ID });
      return;
    }
    await route.fulfill({ status: 404, body: '' });
  });
}

test('displays tab renders the monitor map and promotes a monitor', async ({ page }) => {
  const state = { promoted: false, promotePosts: [] as string[] };
  await mockService(page, state);

  // Legacy /system/displays bookmarks normalize (in-memory) onto the
  // Devices page's Displays tab; the address bar keeps the typed URL.
  await page.goto('/system/displays');

  // Three numbered monitor rects.
  const rects = page.getByRole('option');
  await expect(rects).toHaveCount(3);
  await expect(rects.nth(0)).toContainText('1');
  await expect(rects.nth(2)).toContainText('3');

  // Primary monitor selected by default; detail shows its facts.
  const detail = page.getByTestId('display-detail');
  await expect(detail).toContainText('DEL 41B7');
  await expect(detail).toContainText('3840 × 2160');
  await expect(detail).toContainText('150%');

  // The primary display can't host a panel: notice instead of the button.
  await expect(detail.getByText("The primary display can't be used as a Nexus panel.")).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Use as Nexus panel' })).toHaveCount(0);

  // The Y70 monitor is auto-managed: badge, no promote/demote.
  await rects.nth(2).click();
  await expect(detail).toContainText('Y70');
  await expect(detail.getByText('managed automatically')).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Stop using as panel' })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: 'Use as Nexus panel' })).toHaveCount(0);

  // Promote a non-primary monitor: POST fires, detail flips to assigned.
  await rects.nth(1).click();
  await detail.getByRole('button', { name: 'Use as Nexus panel' }).click();
  await expect(detail.getByRole('button', { name: 'Stop using as panel' })).toBeVisible();
  expect(state.promotePosts).toHaveLength(1);
});

test('single-monitor setup shows a notice instead of the promote button', async ({ page }) => {
  const state = { promoted: false, promotePosts: [] as string[] };
  await mockService(page, state);
  // One promotable display (which is therefore the primary): the only screen
  // can't give itself up to a panel.
  await page.route('http://localhost:9400/displays/topology', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hostingSupported: true,
        rotationSupported: true,
        reserveSupported: true,
        positionsAvailable: true,
        revision: 1,
        hint: '',
        displays: [
          {
            id: MONITOR_ID,
            number: 1,
            name: 'DEL 41B7',
            manufacturer: 'DEL',
            model: '41B7',
            bounds: { x: 0, y: 0, width: 2560, height: 1440 },
            resolution: { width: 3840, height: 2160 },
            scaleFactor: 1.5,
            dpi: null,
            isPrimary: true,
            isInternal: false,
            isY70: false,
            hostingSupported: true,
            assignedPanelDeviceId: null,
            assignedPanelName: null,
          },
        ],
      }),
    }),
  );

  await page.goto('/system/displays');

  const detail = page.getByTestId('display-detail');
  await expect(detail).toContainText('Connect a second display');
  await expect(detail.getByRole('button', { name: 'Use as Nexus panel' })).toHaveCount(0);
});

test('devices page displays tab shows the monitor map', async ({ page }) => {
  const state = { promoted: false, promotePosts: [] as string[] };
  await mockService(page, state);

  await page.goto('/system/devices');
  await page.getByRole('tab', { name: 'Displays', exact: true }).click();

  await expect(page).toHaveURL(/\/system\/devices\/displays/);
  await expect(page.getByRole('option')).toHaveCount(3);
});

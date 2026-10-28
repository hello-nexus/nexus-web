import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from './types';

// The Y70 kiosk record never has a displayId, yet its see-through window starts with an empty input region
// until the page posts a hit-test message, so PanelApp must report for it.

const fetchMock = vi.fn();
const patchMock = vi.fn();
const patchCapsMock = vi.fn();

vi.mock('../api/panel', async importOriginal => ({
  ...await importOriginal<typeof import('../api/panel')>(),
  fetchPanelDeviceWithStatus: (...args: unknown[]) => fetchMock(...args),
  patchPanelDeviceWithStatus: (...args: unknown[]) => patchMock(...args),
  patchPanelDevice: (...args: unknown[]) => patchCapsMock(...args),
}));

vi.mock('../hooks/useMultiplexSocket', async importOriginal => ({
  ...await importOriginal<typeof import('../hooks/useMultiplexSocket')>(),
  useMultiplex: () => null,
  useTopic: () => null,
  useTopicCallback: () => {},
}));

vi.mock('../hooks/useServiceStatus', async importOriginal => ({
  ...await importOriginal<typeof import('../hooks/useServiceStatus')>(),
  useServiceStatus: () => ({ state: 'online', ping: null }),
}));

vi.mock('./engine/panelSync', () => ({
  broadcastLayoutChanged: vi.fn(),
  onLayoutChanged: () => () => {},
}));

import PanelApp from './PanelApp';
import { UiSettingsProvider } from '../hooks/useUiSettings';

const layout: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'y70',
  pages: [{ id: 'p0', widgets: [{ id: 'w1', type: 'clock', size: '2x2', col: 0, row: 0, config: {} }] }],
};

const recordWith = (extra: Record<string, unknown>) => ({
  id: 'y70-rec',
  displayName: 'Y70',
  firstSeenAt: 0,
  lastSeenAt: 0,
  backdrop: 'desktop',
  layout,
  capabilities: { surface: 'y70', touch: true, orientation: 'Landscape', dpi: 96, cssWidth: 1920, cssHeight: 480, dpr: 1 },
  ...extra,
});

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, writable: true, value: 1 });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 10, y: 20, top: 20, left: 10, right: 210, bottom: 120, width: 200, height: 100, toJSON: () => ({}),
  }));
}

const postMessage = vi.fn();

async function mount(extra: Record<string, unknown>) {
  const record = recordWith(extra);
  fetchMock.mockResolvedValue({ found: true, record });
  patchMock.mockResolvedValue({ ok: true, record });
  render(
    <UiSettingsProvider serviceOnline={true} manageDom={false}>
      <PanelApp deviceId="y70-rec" />
    </UiSettingsProvider>,
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
}

const hitTests = () => postMessage.mock.calls.map(c => c[0] as { type: string; mode: string; rects: unknown[] }).filter(m => m.type === 'nexus.panel.hitTest');

beforeEach(() => {
  fetchMock.mockReset();
  patchMock.mockReset();
  patchCapsMock.mockReset().mockResolvedValue(null);
  postMessage.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  (window as unknown as { chrome?: unknown }).chrome = { webview: { postMessage } };
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setViewport(1920, 480);
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { chrome?: unknown }).chrome;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PanelApp host hit-test on the Y70 kiosk (record without displayId)', () => {
  it('reports the full region when click-through is off', async () => {
    await mount({ clickThrough: false });

    expect(hitTests()).toContainEqual({ type: 'nexus.panel.hitTest', mode: 'full', dpr: 1, rects: [] });
  });

  it('reports the widget rects when click-through is on', async () => {
    await mount({ clickThrough: true });

    const regions = hitTests().filter(m => m.mode === 'region');
    expect(regions.length).toBeGreaterThan(0);
    expect(regions[regions.length - 1].rects).toContainEqual({ x: 10, y: 20, w: 200, h: 100 });
  });

  it('does not report on a Theme backdrop, which is not see-through', async () => {
    await mount({ backdrop: 'theme' });

    expect(hitTests()).toEqual([]);
  });
});

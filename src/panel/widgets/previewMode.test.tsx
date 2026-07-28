// Registry-wide preview-mode guard. Every built-in widget must render a
// populated tile under PanelPreviewProvider with ZERO I/O: no fetch, no
// WebSocket, no Worker, no blob URLs, no multiplex subscribe, no <iframe>.
// Renders without the catalog's ErrorBoundary so a broken preview fails loudly
// instead of becoming a silent error tile. The content table doubles as the
// fixture-sync gate: when a widget's UI changes, its preview fixture and this
// table must be re-verified (see .agents/rules/widget-preview-fixtures.md in
// the master repo).
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_REGISTRY, pickerSizeFor } from './registry';
import { PanelPreviewProvider } from './common/PanelPreviewContext';
import { MultiplexContext, type MultiplexContextValue } from '../../hooks/useMultiplexSocket';
import type { PanelWidget, PanelWidgetSize } from '../types';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The real client fails closed in jsdom (remote-origin guard) before reaching
// window.fetch, so spy at the service-client seam - every widget REST/blob
// call funnels through these helpers.
const serviceCallSpy = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
vi.mock('../../api/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/service')>();
  return {
    ...actual,
    fetchService: serviceCallSpy,
    postService: serviceCallSpy,
    putService: serviceCallSpy,
    deleteService: serviceCallSpy,
    patchService: serviceCallSpy,
    postServiceForm: serviceCallSpy,
    fetchServiceBlob: serviceCallSpy,
    pingService: serviceCallSpy,
  };
});

vi.mock('../../hooks/useUiSettings', () => ({
  useUiSettings: () => ({
    settings: { widgetAdvancedMode: true, preferredCpuTempSensorId: '', preferredGpuTempSensorId: '' },
    update: vi.fn(),
    reload: vi.fn(),
  }),
  useTempSensorPrefs: () => ({ cpuId: '', gpuId: '' }),
  usePreferredGpuId: () => '',
  useUnitPrefs: () => ({ monitoringTempUnit: 'c', timeFormat: 'system', numberFormat: 'system' }),
}));

const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}')));
const webSocketSpy = vi.fn();
const workerSpy = vi.fn();
const createObjectUrlSpy = vi.fn(() => 'blob:preview-test');
const subscribeSpy = vi.fn();

class WebSocketStub {
  constructor(...args: unknown[]) { webSocketSpy(...args); }
  addEventListener() {}
  close() {}
  send() {}
}
class WorkerStub {
  constructor(...args: unknown[]) { workerSpy(...args); }
  addEventListener() {}
  postMessage() {}
  terminate() {}
}

const multiplexStub: MultiplexContextValue = {
  subscribe: subscribeSpy,
  unsubscribe: vi.fn(),
  connected: true,
  transport: 'lan',
  remoteDisabled: false,
} as unknown as MultiplexContextValue;

// Expected fixture content per widget, asserted at the picker size. Keyed by
// load-bearing fixture fields - fails when a widget's UI stops rendering them.
const PREVIEW_CONTENT: Record<string, string[]> = {
  steam: ['Nova', 'Star Voyager', 'Driftline'],
  discord: ['Nova', 'discord.notificationCount'],
  obs: ['Gameplay'],
  media: ['Midnight Drive', 'The Wavelengths'],
  weather: ['Mostly sunny', 'San Francisco', 'panel.widget.weather.hiLo'],
  stocks: ['Dow Jones', 'NASDAQ', 'AAPL', '52,637'],
  screentime: ['Figma', 'Chrome'],
  displays: ['DISPLAY 1', 'DISPLAY 2'],
  cooling: ['cooling.preset.balanced'],
  'smart-lights': ['smartLights.onlineOfTotal'],
  deck: ['CPU Total', '58 %'],
  twitch: ['nova_streams', 'LIVE'],
  // The mocked t() returns keys, so the overall status pill surfaces as the
  // raw 'diagnostics.status.watch' key; the reason line falls back to the
  // fixture's own summary text (see diagnosticsHelpers.reasonLabel).
  diagnostics: ['diagnostics.status.watch', 'Thermal throttling active'],
  // The mocked t() returns keys, so the fixture's machineName surfaces as the
  // idle 'transfer.sendTo' status line rather than 'Nexus-PC' itself.
  transfer: ['transfer.photo', 'transfer.clipboard', 'transfer.sendTo'],
};

function panelWidget(type: string, size: PanelWidgetSize): PanelWidget {
  return { id: `preview-${type}-${size}`, type, size, col: 0, row: 0 };
}

function renderPreview(type: string, size: PanelWidgetSize) {
  const def = APP_REGISTRY[type];
  const Comp = def.Preview ?? def.Widget;
  return render(
    <MultiplexContext.Provider value={multiplexStub}>
      <PanelPreviewProvider value={true}>
        <Comp widget={panelWidget(type, size)} />
      </PanelPreviewProvider>
    </MultiplexContext.Provider>,
  );
}

describe('widget preview mode', () => {
  const realCreateObjectUrl = URL.createObjectURL;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('WebSocket', WebSocketStub);
    vi.stubGlobal('Worker', WorkerStub);
    // Direct assignment - vi.unstubAllGlobals() doesn't cover it, restore below.
    URL.createObjectURL = createObjectUrlSpy as typeof URL.createObjectURL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    URL.createObjectURL = realCreateObjectUrl;
    serviceCallSpy.mockClear();
    fetchSpy.mockClear();
    webSocketSpy.mockClear();
    workerSpy.mockClear();
    createObjectUrlSpy.mockClear();
    subscribeSpy.mockClear();
  });

  for (const [type, def] of Object.entries(APP_REGISTRY)) {
    const pickerSize = pickerSizeFor(def.meta);
    const sizes = new Set<PanelWidgetSize>([pickerSize]);
    // The catalog's browse-size preference renders 2x2-capable tiles at 2x2 -
    // the compact branch must render from the same fixture.
    if (def.meta.sizes.includes('2x2')) sizes.add('2x2');

    for (const size of sizes) {
      it(`${type} @ ${size} renders with zero I/O`, async () => {
        const { container, unmount } = renderPreview(type, size);

        // Flush microtasks so any (incorrectly) ungated async path fires.
        await Promise.resolve();
        await Promise.resolve();

        expect(serviceCallSpy).not.toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(webSocketSpy).not.toHaveBeenCalled();
        expect(workerSpy).not.toHaveBeenCalled();
        expect(createObjectUrlSpy).not.toHaveBeenCalled();
        expect(subscribeSpy).not.toHaveBeenCalled();
        expect(container.querySelector('iframe')).toBeNull();

        // No external image sources - previews must be self-contained.
        for (const img of Array.from(container.querySelectorAll('img'))) {
          const src = img.getAttribute('src') ?? '';
          expect(src.startsWith('data:') || src === '').toBe(true);
        }

        unmount();
      });
    }

    const expected = PREVIEW_CONTENT[type];
    if (expected) {
      it(`${type} preview shows fixture content`, () => {
        renderPreview(type, pickerSize);
        for (const text of expected) {
          expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
        }
      });
    }
  }

  it('gallery preview renders an inline data-URI cover', () => {
    const { container } = renderPreview('gallery', pickerSizeFor(APP_REGISTRY.gallery.meta));
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
  });
});

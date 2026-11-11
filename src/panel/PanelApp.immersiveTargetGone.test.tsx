import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from './types';

const fetchMock = vi.fn();
const patchMock = vi.fn();
const patchCapsMock = vi.fn();

vi.mock('../api/panel', async importOriginal => ({
  ...await importOriginal<typeof import('../api/panel')>(),
  fetchPanelDeviceWithStatus: (...args: unknown[]) => fetchMock(...args),
  patchPanelDeviceWithStatus: (...args: unknown[]) => patchMock(...args),
  patchPanelDevice: (...args: unknown[]) => patchCapsMock(...args),
}));

const topicHandlers = new Map<string, (raw: unknown) => void>();
vi.mock('../hooks/useMultiplexSocket', async importOriginal => ({
  ...await importOriginal<typeof import('../hooks/useMultiplexSocket')>(),
  useMultiplex: () => null,
  useTopic: () => null,
  useTopicCallback: (topic: string, enabled: boolean, handler: (raw: unknown) => void) => {
    if (enabled) topicHandlers.set(topic, handler);
  },
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

const clock = (id: string) => ({ id, type: 'clock', size: '2x2', col: 0, row: 0, config: {} });
const layoutOf = (...ids: string[]): PanelLayout => ({
  layoutSchemaVersion: 2,
  surface: 'monitor',
  pages: [{ id: 'p0', widgets: ids.map(clock) }],
});

const recordWith = (layout: PanelLayout) => ({
  id: 'disp-rec',
  displayName: 'Touch bar',
  firstSeenAt: 0,
  lastSeenAt: 0,
  displayId: 'disp1',
  backdrop: 'desktop',
  immersiveBackdrop: false,
  layout,
  capabilities: { surface: 'monitor', touch: true, orientation: 'Landscape', dpi: 94, cssWidth: 1920, cssHeight: 515, dpr: 1 },
});

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, writable: true, value: 1 });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  }));
}

const widget = (id: string) => document.querySelector<HTMLElement>(`[data-panel-widget-id="${id}"]`);
const seeThrough = () => document.querySelector('[data-immersive-see-through="true"]');
const closeImmersive = () => screen.queryByRole('button', { name: 'panel.immersive.close', hidden: true });

function tap(el: Element) {
  fireEvent.pointerDown(el, { pointerId: 1, pointerType: 'touch', button: 0, isPrimary: true });
  fireEvent.pointerUp(el, { pointerId: 1, pointerType: 'touch', button: 0, isPrimary: true });
}

const settle = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});

beforeEach(() => {
  fetchMock.mockReset();
  patchMock.mockReset();
  patchCapsMock.mockReset().mockResolvedValue(null);
  topicHandlers.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setViewport(1920, 515);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PanelApp immersive widget removed from the layout', () => {
  it('leaves immersive and shows the dashboard again', async () => {
    const record = recordWith(layoutOf('w0', 'w1'));
    fetchMock.mockResolvedValue({ found: true, record });
    patchMock.mockResolvedValue({ ok: true, record });
    render(
      <UiSettingsProvider serviceOnline={true} manageDom={false}>
        <PanelApp deviceId="disp-rec" />
      </UiSettingsProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await settle(1_000);

    tap(widget('w0')!);
    await settle(500);
    expect(closeImmersive()).not.toBeNull();
    expect(seeThrough()).not.toBeNull();

    fetchMock.mockResolvedValue({ found: true, record: recordWith(layoutOf('w1')) });
    await act(async () => {
      topicHandlers.get('panel/device')?.({ deviceId: 'disp-rec' });
    });
    await settle(1_000);

    expect(widget('w0')).toBeNull();
    expect(widget('w1')).not.toBeNull();
    expect(closeImmersive()).toBeNull();
    expect(seeThrough()).toBeNull();

    tap(widget('w1')!);
    await settle(500);
    expect(closeImmersive()).not.toBeNull();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from './types';

// A touch generic display keeps its pages and tap-to-immersive; a mouse-only one stays single page.

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

const clock = (id: string) => ({ id, type: 'clock', size: '2x2', col: 0, row: 0, config: {} });
const layout: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'monitor',
  pages: [{ id: 'p0', widgets: [clock('w0')] }, { id: 'p1', widgets: [clock('w1')] }],
};

const recordWith = (touch: boolean, backdrop = 'desktop', family?: string) => ({
  id: 'disp-rec',
  displayName: 'Touch bar',
  firstSeenAt: 0,
  lastSeenAt: 0,
  displayId: 'disp1',
  backdrop,
  layout,
  capabilities: { surface: 'monitor', touch, orientation: 'Landscape', dpi: 94, cssWidth: 1920, cssHeight: 515, dpr: 1, ...(family ? { family } : {}) },
});

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, writable: true, value: 1 });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  }));
}

async function mount(touch: boolean, backdrop = 'desktop', family?: string) {
  const record = recordWith(touch, backdrop, family);
  fetchMock.mockResolvedValue({ found: true, record });
  patchMock.mockResolvedValue({ ok: true, record });
  render(
    <UiSettingsProvider serviceOnline={true} manageDom={false}>
      <PanelApp deviceId="disp-rec" />
    </UiSettingsProvider>,
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
}

const renderedPages = () => Array.from(document.querySelectorAll<HTMLElement>('[data-panel-page-index]'));
const widget = (id: string) => document.querySelector<HTMLElement>(`[data-panel-widget-id="${id}"]`);
const closeImmersive = () => screen.queryByRole('button', { name: 'panel.immersive.close', hidden: true });

function tap(el: Element, pointerType = 'touch') {
  fireEvent.pointerDown(el, { pointerId: 1, pointerType, button: 0, isPrimary: true });
  fireEvent.pointerUp(el, { pointerId: 1, pointerType, button: 0, isPrimary: true });
}

function writtenLayouts(): PanelLayout[] {
  return patchMock.mock.calls
    .map(([, patch]) => (patch as { layout?: PanelLayout }).layout)
    .filter((l): l is PanelLayout => !!l);
}

beforeEach(() => {
  fetchMock.mockReset();
  patchMock.mockReset();
  patchCapsMock.mockReset().mockResolvedValue(null);
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

describe('PanelApp generic display with touch', () => {
  it('shows every stored page without folding, and no blank page while click-through', async () => {
    await mount(true);

    expect(renderedPages()).toHaveLength(2);
    expect(widget('w1')).not.toBeNull();
    for (const written of writtenLayouts()) expect(written.pages).toHaveLength(2);
  });

  it('keeps the trailing blank page on an opaque backdrop', async () => {
    await mount(true, 'theme');

    expect(renderedPages()).toHaveLength(3);
  });

  it('keeps the trailing blank page on a known display over the desktop', async () => {
    await mount(true, 'desktop', 'xeneon-edge');

    expect(renderedPages()).toHaveLength(3);
  });

  it('enters immersive on a tap', async () => {
    await mount(true);

    tap(widget('w0')!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(closeImmersive()).not.toBeNull();
  });
});

describe('PanelApp generic display with touch and a mouse', () => {
  it('enters immersive on a mouse click the same way a tap does', async () => {
    await mount(true);

    tap(widget('w0')!, 'mouse');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(closeImmersive()).not.toBeNull();
  });
});

describe('PanelApp generic display without touch', () => {
  it('renders the first page only and holds the rest', async () => {
    await mount(false);

    expect(renderedPages()).toHaveLength(1);
    expect(widget('w1')).toBeNull();
  });

  it('does not enter immersive on a tap', async () => {
    await mount(false);

    tap(widget('w0')!);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(closeImmersive()).toBeNull();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelWidget } from './types';
import { MAX_PANEL_PAGES } from './engine/panelGrid';

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

vi.mock('./engine/panelSync', () => ({
  broadcastLayoutChanged: vi.fn(),
  onLayoutChanged: () => () => {},
}));

import PanelApp from './PanelApp';
import { UiSettingsProvider } from '../hooks/useUiSettings';

const clock = (id: string): PanelWidget => ({ id, type: 'clock', size: '4x2', col: 0, row: 0, config: {} });

const layoutOf = (pageCount: number): PanelLayout => ({
  layoutSchemaVersion: 2,
  surface: 'y70',
  pages: Array.from({ length: pageCount }, (_, i) => ({ id: `page-${i}`, widgets: [clock(`w-${i}`)] })),
});

const recordWith = (layout: PanelLayout) => ({
  id: 'y70-1',
  displayName: 'Y70',
  firstSeenAt: 0,
  lastSeenAt: 0,
  layout,
  capabilities: { surface: 'y70', touch: true, dpi: 337, cssWidth: 1100, cssHeight: 3840, dpr: 1 },
});

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, writable: true, value: 1 });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  }));
}

async function mountKiosk(stored: PanelLayout) {
  fetchMock.mockResolvedValue({ found: true, record: recordWith(stored) });
  patchMock.mockResolvedValue({ ok: true, record: recordWith(stored) });
  render(
    <UiSettingsProvider serviceOnline={true} manageDom={false}>
      <PanelApp deviceId="y70-1" />
    </UiSettingsProvider>,
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
}

const renderedPages = () => Array.from(document.querySelectorAll<HTMLElement>('[data-panel-page-index]'));

function swipeLeft(el: Element) {
  const at = (clientX: number) => ({ touches: [{ clientX, clientY: 100, target: el }] });
  fireEvent.touchStart(el, at(600));
  fireEvent.touchMove(el, at(500));
  fireEvent.touchMove(el, at(100));
  fireEvent.touchEnd(el, { touches: [] });
}

function writtenLayouts(): PanelLayout[] {
  return patchMock.mock.calls
    .map(([, patch]) => (patch as { layout?: PanelLayout }).layout)
    .filter((l): l is PanelLayout => !!l);
}

beforeEach(() => {
  fetchMock.mockReset();
  patchMock.mockReset();
  patchCapsMock.mockReset();
  patchCapsMock.mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setViewport(1100, 3840);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PanelApp trailing blank page', () => {
  it('renders an empty page after a last page with content, without storing it', async () => {
    await mountKiosk(layoutOf(1));
    const pages = renderedPages();
    expect(pages).toHaveLength(2);
    expect(pages[1].querySelector('[data-panel-widget-id]')).toBeNull();
    for (const written of writtenLayouts()) expect(written.pages).toHaveLength(1);
  });

  it('adds no blank page at the page cap', async () => {
    await mountKiosk(layoutOf(MAX_PANEL_PAGES));
    expect(renderedPages()).toHaveLength(MAX_PANEL_PAGES);
  });

  it('creates the page when a widget is added while the blank page shows', async () => {
    await mountKiosk(layoutOf(1));
    act(() => swipeLeft(renderedPages()[0]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(renderedPages()[1].getAttribute('aria-hidden')).toBe('false');

    fireEvent.contextMenu(renderedPages()[1]);
    fireEvent.click(await screen.findByRole('button', { name: 'panel.actions.addWidget', hidden: true }));
    const tile = await within(await screen.findByRole('dialog')).findByRole('button', { name: 'panel.widget.clock' });
    fireEvent.click(tile);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    const last = writtenLayouts().at(-1)!;
    expect(last.pages).toHaveLength(2);
    expect(last.pages[0].widgets.map(w => w.id)).toEqual(['w-0']);
    expect(last.pages[1].widgets).toHaveLength(1);
    expect(last.activePageId).toBe(last.pages[1].id);
  });
});

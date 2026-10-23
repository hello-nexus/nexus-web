import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from './types';

// The kiosk composition end to end: PanelApp -> usePanelRecord ->
// usePanelLayout -> PanelContent's repagination, with only the transport
// mocked. A hook-level test cannot box this bug: the write lives in
// PanelContent's effect, the layout hook only carries it.
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

// A Y70 layout that fills its 4x16 portrait column exactly, in the storage
// order a real record carried (settings.json from a support bundle). The
// calendar sits between the clock and the 4x4 stack - the placement the
// write-back destroys.
const widget = (id: string, type: string, size: PanelWidgetSize, row: number): PanelWidget => ({
  id, type, size, col: 0, row, config: {},
});
const STORED: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'y70',
  activePageId: 'page-1',
  pages: [{
    id: 'page-1',
    widgets: [
      widget('w-clock', 'clock', '4x2', 0),
      widget('w-cooling', 'cooling', '4x4', 12),
      widget('w-monitoring', 'monitoring', '4x4', 8),
      widget('w-calendar', 'calendar', '4x2', 2),
      widget('w-weather', 'weather', '4x4', 4),
    ],
  }],
};

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
  // jsdom has no layout: the panel root measures 0x0 and the grid would fall
  // back to a 1x1 canvas. Report the viewport as every element's rect so
  // useRuntimePanelGrid solves the same capacity the kiosk window would.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}),
  }));
}

function gridCapacity(): { columns: number; rows: number } {
  const root = document.querySelector<HTMLElement>('.panel-root');
  if (!root) throw new Error('panel root not mounted');
  return {
    columns: Number(root.style.getPropertyValue('--panel-columns')),
    rows: Number(root.style.getPropertyValue('--panel-rows')),
  };
}

// Rendered placement, from the cells' own data attributes, in reading order.
function renderedPlacements(): string {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-panel-widget-id]'))
    .map(el => ({
      id: el.dataset.panelWidgetId ?? '',
      col: Number(el.dataset.panelCellCol),
      row: Number(el.dataset.panelCellRow),
    }))
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map(c => `${c.id}@${c.col},${c.row}`)
    .join(' ');
}

const STORED_PORTRAIT = 'w-clock@0,0 w-calendar@0,2 w-weather@0,4 w-monitoring@0,8 w-cooling@0,12';

async function mountKiosk() {
  render(
    <UiSettingsProvider serviceOnline={true} manageDom={false}>
      <PanelApp deviceId="y70-1" />
    </UiSettingsProvider>,
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  // Past the record fetch, the hydration render, and the patch debounce.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
}

// The record as the next kiosk would read it: the last layout PATCHed, else
// the stored one.
function recordLayoutNow(): PanelLayout {
  const written = patchMock.mock.calls
    .map(([, patch]) => (patch as { layout?: PanelLayout }).layout)
    .filter((l): l is PanelLayout => !!l);
  return written.length > 0 ? written[written.length - 1] : STORED;
}

beforeEach(() => {
  fetchMock.mockReset();
  patchMock.mockReset();
  patchCapsMock.mockReset();
  fetchMock.mockResolvedValue({ found: true, record: recordWith(STORED) });
  patchMock.mockResolvedValue({ ok: true, record: recordWith(STORED) });
  patchCapsMock.mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('kiosk layout write-back', () => {
  it('never writes a capacity-driven repagination back to the record (landscape Y70 kiosk)', async () => {
    // A display-topology reshuffle briefly hands the Y70 kiosk a 3840x1100
    // window (nexus-overlay: "panel kiosk monitor bounds changed ->
    // 3840x1100; recreating"). The grid transposes to 16x4 and the layout is
    // repacked column-major; that shape must stay render-only. Written back,
    // the portrait re-fit orders by the landscape rows and every 4x2 that
    // sat between 4x4s sinks to the bottom of the column.
    setViewport(3840, 1100);
    await mountKiosk();

    // The transient shape really was in effect for this render.
    expect(gridCapacity()).toEqual({ columns: 16, rows: 4 });
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('never writes the stored layout back on a plain portrait boot either', async () => {
    setViewport(1100, 3840);
    await mountKiosk();

    expect(gridCapacity()).toEqual({ columns: 4, rows: 16 });
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('renders the stored placement when the kiosk comes back portrait after a landscape boot', async () => {
    // The overlay recreates the kiosk on every bounds change, so this is two
    // mounts: one at the transient landscape bounds, then a portrait one
    // reading whatever the first left in the record.
    setViewport(3840, 1100);
    await mountKiosk();
    expect(gridCapacity()).toEqual({ columns: 16, rows: 4 });
    const recordAfterLandscape = recordWith(recordLayoutNow());
    cleanup();

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ found: true, record: recordAfterLandscape });
    setViewport(1100, 3840);
    await mountKiosk();
    expect(gridCapacity()).toEqual({ columns: 4, rows: 16 });
    expect(renderedPlacements()).toBe(STORED_PORTRAIT);
  });
});

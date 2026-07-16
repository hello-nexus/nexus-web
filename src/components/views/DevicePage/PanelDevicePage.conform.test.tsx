import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout } from '../../../panel/types';
import { sizeToSpan } from '../../../panel/engine/grid';

// Pins the editor's geometry conformance: opening the page repairs the editor
// state render-only (no write), and any persisted layout is a fixed point of
// repaginatePanelLayout at the editor capacity (in-bounds, overlap-free for
// pages that fit) - the invariant that keeps preview == persisted placement.

const fetchPanelDevicesMock = vi.fn();
const patchPanelDeviceMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/displays', () => ({
  demoteDisplayPanel: vi.fn().mockResolvedValue(null),
  fetchDisplays: vi.fn().mockResolvedValue({ displays: [] }),
  fetchDisplayTopology: vi.fn().mockResolvedValue(null),
  rotateDisplay: vi.fn().mockResolvedValue(null),
  setDisplayBrightness: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/profiles', () => ({
  fetchPreferences: vi.fn().mockResolvedValue({ panel: { autoLaunch: false, reserveMonitor: true } }),
  savePreferences: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/panel', () => ({
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'dev1' }),
  fetchPanelDevice: vi.fn().mockResolvedValue(null),
  fetchPanelDevices: (...a: unknown[]) => fetchPanelDevicesMock(...a),
  patchPanelDevice: (...a: unknown[]) => patchPanelDeviceMock(...a),
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: () => {},
}));
vi.mock('../../../panel/engine/panelSync', () => ({
  broadcastLayoutChanged: vi.fn(),
}));
vi.mock('../../../panel/theme/panelTheme', () => ({
  usePanelTheme: () => ({
    theme: { themeSyncWithDesktop: false, themeMode: 'dark', appThemeMode: 'dark', appResolvedThemeMode: 'dark' },
    commitThemeSync: vi.fn(), commitThemeMode: vi.fn(), commitAccentSync: vi.fn(),
    previewAccent: vi.fn(), commitAccent: vi.fn(), previewBackground: vi.fn(),
    commitBackground: vi.fn(), commitBackgroundMode: vi.fn(), commitBackgroundEffect: vi.fn(),
    commitBackgroundTemplate: vi.fn(), previewBackgroundEffectState: vi.fn(), commitBackgroundEffectState: vi.fn(),
    previewBackgroundOpacity: vi.fn(), commitBackgroundOpacity: vi.fn(), previewWidgetOpacity: vi.fn(),
    commitWidgetOpacity: vi.fn(), commitWidgetLabels: vi.fn(), commitBackgroundFrost: vi.fn(),
  }),
  buildPanelThemeVars: () => ({}),
  useResolvedPanelThemeMode: () => 'dark',
}));
vi.mock('../../../panel/editor/PanelWidgetCatalog', () => ({
  PanelWidgetCatalog: () => <div data-testid="catalog" />,
}));
vi.mock('../../../panel/editor/PanelThemeSettings', () => ({
  PanelThemeSettings: () => <div data-testid="theme" />,
}));
vi.mock('../../../panel/widgets/registry', () => ({
  lookupApp: (type: string) => ({
    meta: { type, i18nKey: 'k', sizes: ['2x2', '4x4'], defaultSize: '2x2', icon: () => null },
    Widget: () => <div data-testid="widget-preview" />,
    Settings: undefined,
  }),
  sizesForSurface: () => ['2x2', '4x4'],
  appAvailableForSurface: () => true,
}));

// Iframe stub: one button that echoes a NOT-conformed layout up (an
// out-of-bounds widget), like a stale simulator would.
vi.mock('./PanelEmbedFrame', () => ({
  PanelEmbedFrame: (props: {
    layout: PanelLayout;
    onLayoutChange: (l: PanelLayout) => void;
  }) => (
    <div data-testid="embed">
      <button
        data-testid="echo-bad-layout"
        onClick={() => props.onLayoutChange({
          layoutSchemaVersion: 2,
          surface: 'y70',
          pages: [{
            id: 'p1',
            widgets: [
              { id: 'a', type: 'cooling', size: '2x2', col: 6, row: 0 },
              { id: 'b', type: 'cooling', size: '2x2', col: 0, row: 40 },
            ],
          }],
        })}
      >echo</button>
    </div>
  ),
}));

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

// Widget at col 6 is outside the 4-column y70 grid; row 40 outside 16 rows.
const OUT_OF_BOUNDS_LAYOUT: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'y70',
  pages: [{
    id: 'p1',
    widgets: [
      { id: 'a', type: 'cooling', size: '2x2', col: 6, row: 0 },
      { id: 'b', type: 'cooling', size: '2x2', col: 0, row: 40 },
    ],
  }],
};

const DEVICE: PanelDevice = {
  id: 'dev1',
  name: 'Y70',
  connectionKind: 'simulated',
  surfaceProfileKey: 'y70',
  runtimeSurface: 'y70',
  capabilities: { surface: 'y70', touch: true } as PanelDevice['capabilities'],
} as PanelDevice;

function assertConformed(layout: PanelLayout, gridCols: number, pageRows: number) {
  for (const page of layout.pages) {
    const rects = page.widgets.map(w => {
      const span = sizeToSpan(w.size);
      return { id: w.id, left: w.col, right: w.col + span.cols, top: w.row, bottom: w.row + span.rows };
    });
    for (const r of rects) {
      expect(r.left, `${r.id} left`).toBeGreaterThanOrEqual(0);
      expect(r.top, `${r.id} top`).toBeGreaterThanOrEqual(0);
      expect(r.right, `${r.id} right`).toBeLessThanOrEqual(gridCols);
      expect(r.bottom, `${r.id} bottom`).toBeLessThanOrEqual(pageRows);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  }
}

beforeEach(() => {
  fetchPanelDevicesMock.mockReset();
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
  fetchPanelDevicesMock.mockResolvedValue({
    devices: [{ id: 'dev1', capabilities: { surface: 'y70', touch: true }, layout: OUT_OF_BOUNDS_LAYOUT, reserveMonitor: true }],
  });
});

afterEach(() => vi.restoreAllMocks());

describe('PanelDevicePage geometry conformance', () => {
  it('opening the editor repairs state render-only and never writes', async () => {
    render(<PanelDevicePage device={DEVICE} />);
    await waitFor(() => screen.getByTestId('embed'));
    // Give the conform effect a settled tick, then confirm no persistence.
    await act(async () => {});
    expect(patchPanelDeviceMock).not.toHaveBeenCalled();
  });

  it('persists conformed geometry when the iframe echoes an out-of-bounds layout', async () => {
    render(<PanelDevicePage device={DEVICE} />);
    await waitFor(() => screen.getByTestId('embed'));
    await act(async () => { fireEvent.click(screen.getByTestId('echo-bad-layout')); });
    await waitFor(() => expect(patchPanelDeviceMock).toHaveBeenCalled());
    const patched = patchPanelDeviceMock.mock.calls.at(-1)?.[1]?.layout as PanelLayout;
    expect(patched).toBeTruthy();
    assertConformed(patched, 4, 16);
  });

  it('never conforms against the monitor fallback capacity (no canvas facts)', async () => {
    // A monitor record with no stamped canvas leaves editorCapacity on the
    // 8x6 guess; an edit must persist geometry untouched, not repack the
    // whole layout at a capacity the device may not have.
    fetchPanelDevicesMock.mockResolvedValue({
      devices: [{ id: 'dev1', capabilities: { surface: 'monitor', touch: true }, layout: OUT_OF_BOUNDS_LAYOUT, reserveMonitor: true }],
    });
    const monitorDevice = {
      ...DEVICE,
      runtimeSurface: 'monitor',
      surfaceProfileKey: 'monitor-x',
      capabilities: { surface: 'monitor', touch: true },
    } as PanelDevice;
    render(<PanelDevicePage device={monitorDevice} />);
    await waitFor(() => screen.getByTestId('embed'));
    await act(async () => { fireEvent.click(screen.getByTestId('echo-bad-layout')); });
    await waitFor(() => expect(patchPanelDeviceMock).toHaveBeenCalled());
    const patched = patchPanelDeviceMock.mock.calls.at(-1)?.[1]?.layout as PanelLayout;
    const positions = patched.pages[0].widgets.map(w => ({ id: w.id, col: w.col, row: w.row }));
    expect(positions).toEqual([
      { id: 'a', col: 6, row: 0 },
      { id: 'b', col: 0, row: 40 },
    ]);
  });

  it('never binds a display-bound record: sim edits allocate their own record and keep the preset canvas', async () => {
    // A real promoted monitor (displayId set, 1024x600 canvas) exists; the
    // SIMULATED monitor preset must not surface-match onto it. Its edit
    // allocates a fresh record, and capacity comes from the preset canvas
    // (2560x720 @ 183 -> 14x4): the widget at col 6 survives, which the
    // hijacked 1024x600 grid (6 cols) would have clamped.
    fetchPanelDevicesMock.mockResolvedValue({
      devices: [{
        id: 'real-mon',
        displayId: 'DISPLAY1',
        capabilities: { surface: 'monitor', touch: true, cssWidth: 1024, cssHeight: 600, dpr: 1 },
        layout: OUT_OF_BOUNDS_LAYOUT,
        reserveMonitor: true,
      }],
    });
    const simMonitor = {
      ...DEVICE,
      runtimeSurface: 'monitor',
      surfaceProfileKey: 'simulated-xeneon-edge',
      previewSize: { width: 2560, height: 720 },
      previewDpi: 183,
      capabilities: { surface: 'monitor', touch: true },
    } as PanelDevice;
    render(<PanelDevicePage device={simMonitor} />);
    await waitFor(() => screen.getByTestId('embed'));
    await act(async () => { fireEvent.click(screen.getByTestId('echo-bad-layout')); });
    await waitFor(() => expect(patchPanelDeviceMock).toHaveBeenCalled());
    const patchedIds = patchPanelDeviceMock.mock.calls.map(c => c[0]);
    expect(patchedIds).not.toContain('real-mon');
    expect(patchedIds).toContain('dev1');
    const patched = patchPanelDeviceMock.mock.calls.at(-1)?.[1]?.layout as PanelLayout;
    const a = patched.pages[0].widgets.find(w => w.id === 'a');
    expect(a).toMatchObject({ col: 6, row: 0 });
    assertConformed(patched, 14, 4);
  });
});

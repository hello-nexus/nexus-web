import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelWidget } from '../../../panel/types';

// NEX-58: the widget edit pane must read the widget out of the live layout,
// not a snapshot taken when it was opened. Resizing the widget ON THE DEVICE
// reaches this page through the panel/device reverse sync, which only writes
// `layout` - a snapshotted copy would keep the pane on the old size while the
// preview and the panel both moved.

const fetchPanelDevicesMock = vi.fn();
const fetchPanelDeviceMock = vi.fn();
const patchPanelDeviceMock = vi.fn();
// Captures the page's panel/device reverse-sync handler so a test can fire it
// the way the service's broadcast does.
let topicHandler: ((raw: unknown) => void) | null = null;

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
  fetchPanelDeviceWithStatus: vi.fn().mockResolvedValue({ found: false, status: 404 }),
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'dev1' }),
  fetchPanelDevice: (...a: unknown[]) => fetchPanelDeviceMock(...a),
  fetchPanelDevices: (...a: unknown[]) => fetchPanelDevicesMock(...a),
  patchPanelDevice: (...a: unknown[]) => patchPanelDeviceMock(...a),
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, _on: boolean, cb: (raw: unknown) => void) => {
    if (topic === 'panel/device') topicHandler = cb;
  },
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
    // Renders a config value so the config axis is observable: this change
    // deletes the manual config mirror as well as the size one.
    Settings: (props: { widget: PanelWidget }) => (
      <div data-testid="settings-label">{String(props.widget.config?.label ?? '')}</div>
    ),
  }),
  sizesForSurface: () => ['2x2', '4x4'],
  appAvailableForSurface: () => true,
}));

// Iframe stub: a button that opens the widget's edit pane, exactly as clicking
// the tile in the live preview does.
vi.mock('./PanelEmbedFrame', () => ({
  PanelEmbedFrame: (props: {
    layout: PanelLayout;
    onWidgetClicked: (widget: PanelWidget) => void;
  }) => (
    <div data-testid="embed">
      <button
        data-testid="click-widget"
        onClick={() => props.onWidgetClicked(props.layout.pages[0].widgets[0])}
      >open</button>
    </div>
  ),
}));

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

function layoutWith(size: '2x2' | '4x4', label = 'before'): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'y70',
    pages: [{ id: 'p1', widgets: [{ id: 'a', type: 'cooling', size, col: 0, row: 0, config: { label } }] }],
  };
}

const DEVICE: PanelDevice = {
  id: 'dev1',
  name: 'Y70',
  connectionKind: 'simulated',
  surfaceProfileKey: 'y70',
  runtimeSurface: 'y70',
  capabilities: { surface: 'y70', touch: true } as PanelDevice['capabilities'],
} as PanelDevice;

// The size buttons are aria-labelled "<Size> <size>"; the localized prefix is
// irrelevant, the suffix identifies the option.
const sizeButton = (size: string) => screen.getByLabelText(new RegExp(` ${size}$`));

beforeEach(() => {
  topicHandler = null;
  fetchPanelDeviceMock.mockReset().mockResolvedValue(null);
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
  fetchPanelDevicesMock.mockReset().mockResolvedValue({
    devices: [{ id: 'dev1', capabilities: { surface: 'y70', touch: true }, layout: layoutWith('2x2'), reserveMonitor: true }],
  });
});

afterEach(() => vi.restoreAllMocks());

describe('PanelDevicePage widget edit pane', () => {
  it('tracks a resize made on the device (panel/device reverse sync)', async () => {
    fetchPanelDeviceMock.mockResolvedValue({
      id: 'dev1',
      capabilities: { surface: 'y70', touch: true },
      layout: layoutWith('4x4'),
    });
    render(<PanelDevicePage device={DEVICE} />);
    await waitFor(() => screen.getByTestId('embed'));
    await act(async () => { fireEvent.click(screen.getByTestId('click-widget')); });
    expect(sizeButton('2x2')).toHaveAttribute('aria-pressed', 'true');

    // The device saved a 4x4; the service broadcasts panel/device for it.
    await act(async () => { topicHandler?.({ deviceId: 'dev1' }); });
    await waitFor(() => expect(sizeButton('4x4')).toHaveAttribute('aria-pressed', 'true'));
    expect(sizeButton('2x2')).toHaveAttribute('aria-pressed', 'false');
  });

  it('tracks a config change made on the device', async () => {
    fetchPanelDeviceMock.mockResolvedValue({
      id: 'dev1',
      capabilities: { surface: 'y70', touch: true },
      layout: layoutWith('2x2', 'after'),
    });
    render(<PanelDevicePage device={DEVICE} />);
    await waitFor(() => screen.getByTestId('embed'));
    await act(async () => { fireEvent.click(screen.getByTestId('click-widget')); });
    expect(screen.getByTestId('settings-label').textContent).toBe('before');

    await act(async () => { topicHandler?.({ deviceId: 'dev1' }); });
    await waitFor(() => expect(screen.getByTestId('settings-label').textContent).toBe('after'));
  });

  it('defers a device broadcast that lands during a local write, and applies it after', async () => {
    // The service broadcasts BEFORE the PATCH response returns, so a frame
    // skipped during a write has no later frame to trigger a catch-up.
    // Dropping it instead of deferring loses the device's edit outright.
    let resolvePatch: (v: unknown) => void = () => {};
    patchPanelDeviceMock.mockImplementation(() => new Promise(r => { resolvePatch = r; }));
    fetchPanelDeviceMock.mockResolvedValue({
      id: 'dev1',
      capabilities: { surface: 'y70', touch: true },
      layout: layoutWith('2x2', 'after'),
    });
    render(<PanelDevicePage device={DEVICE} />);
    await waitFor(() => screen.getByTestId('embed'));
    await act(async () => { fireEvent.click(screen.getByTestId('click-widget')); });
    expect(screen.getByTestId('settings-label').textContent).toBe('before');

    // A local write is in flight when the device's own edit broadcasts.
    await act(async () => { fireEvent.click(sizeButton('4x4')); });
    await act(async () => { topicHandler?.({ deviceId: 'dev1' }); });
    expect(screen.getByTestId('settings-label').textContent).toBe('before');

    // Settling the write must run the deferred refetch - no further broadcast
    // arrives, so this is the only chance to pick the device's edit up.
    await act(async () => { resolvePatch({ ok: true }); });
    await waitFor(() => expect(screen.getByTestId('settings-label').textContent).toBe('after'));
  });

  it('discards a refetch a newer local write overtook', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchPanelDeviceMock.mockImplementation(() => new Promise(r => { resolveFetch = r; }));
    render(<PanelDevicePage device={DEVICE} />);
    await waitFor(() => screen.getByTestId('embed'));
    await act(async () => { fireEvent.click(screen.getByTestId('click-widget')); });

    // A refetch starts, then a local resize to 4x4 lands before it resolves.
    await act(async () => { topicHandler?.({ deviceId: 'dev1' }); });
    await act(async () => { fireEvent.click(sizeButton('4x4')); });
    expect(sizeButton('4x4')).toHaveAttribute('aria-pressed', 'true');

    // The in-flight read carries pre-resize state; applying it would undo the
    // local edit the user just made.
    await act(async () => {
      resolveFetch({ id: 'dev1', capabilities: { surface: 'y70', touch: true }, layout: layoutWith('2x2') });
    });
    expect(sizeButton('4x4')).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores the echo of our own write, so a controlled field is not reverted', async () => {
    // The service broadcasts panel/device for OUR patch too. Applying that
    // echo mid-edit would revert the pane to the pre-write value.
    // The server still holds the PRE-write layout until our PATCH lands - that
    // lag is what makes an unguarded echo revert the pane mid-edit.
    let serverLayout = layoutWith('2x2');
    let resolvePatch: () => void = () => {};
    patchPanelDeviceMock.mockImplementation(() => new Promise(r => {
      resolvePatch = () => { serverLayout = layoutWith('4x4'); r({ ok: true }); };
    }));
    fetchPanelDeviceMock.mockImplementation(() => Promise.resolve({
      id: 'dev1',
      capabilities: { surface: 'y70', touch: true },
      layout: serverLayout,
    }));
    render(<PanelDevicePage device={DEVICE} />);
    await waitFor(() => screen.getByTestId('embed'));
    await act(async () => { fireEvent.click(screen.getByTestId('click-widget')); });

    // A local resize starts a patch that has not settled yet.
    await act(async () => { fireEvent.click(sizeButton('4x4')); });
    expect(sizeButton('4x4')).toHaveAttribute('aria-pressed', 'true');

    // The echo lands while our write is still in flight: it must not be
    // applied mid-write, and settling must not undo the edit either.
    await act(async () => { topicHandler?.({ deviceId: 'dev1' }); });
    expect(sizeButton('4x4')).toHaveAttribute('aria-pressed', 'true');
    await act(async () => { resolvePatch(); });
    await waitFor(() => expect(sizeButton('4x4')).toHaveAttribute('aria-pressed', 'true'));
  });

  it('closes when the widget is removed from the pane itself', async () => {
    render(<PanelDevicePage device={DEVICE} />);
    await waitFor(() => screen.getByTestId('embed'));
    await act(async () => { fireEvent.click(screen.getByTestId('click-widget')); });
    expect(screen.queryByTestId('catalog')).toBeNull();

    await act(async () => { fireEvent.click(screen.getByLabelText(/remove/i)); });
    await waitFor(() => expect(screen.getByTestId('catalog')).toBeTruthy());
  });

  it('closes when the widget is removed on the device', async () => {
    fetchPanelDeviceMock.mockResolvedValue({
      id: 'dev1',
      capabilities: { surface: 'y70', touch: true },
      layout: { layoutSchemaVersion: 2, surface: 'y70', pages: [{ id: 'p1', widgets: [] }] } as PanelLayout,
    });
    render(<PanelDevicePage device={DEVICE} />);
    await waitFor(() => screen.getByTestId('embed'));
    await act(async () => { fireEvent.click(screen.getByTestId('click-widget')); });
    expect(screen.queryByTestId('catalog')).toBeNull();

    await act(async () => { topicHandler?.({ deviceId: 'dev1' }); });
    await waitFor(() => expect(screen.getByTestId('catalog')).toBeTruthy());
  });
});

import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelWidget } from '../../../panel/types';

// The Widget size switch on a panel that offers it (the iCUE LINK 5" LCD), and the
// single page a non-touch panel keeps. Layout engine and switch logic are real;
// heavy leaves (catalog, theme, iframe preview) are stubbed.

const fetchPanelDevicesMock = vi.fn();
const patchPanelDeviceMock = vi.fn();
const pushToastMock = vi.fn();

vi.mock('../../common/Toast/Toast', () => ({
  useToast: () => ({ push: pushToastMock }),
  useToastSafe: () => ({ push: pushToastMock }),
}));

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
vi.mock('./PanelPresetToolbar', () => ({ PanelPresetToolbar: () => null }));
vi.mock('../../../api/panel', () => ({
  fetchPanelDeviceWithStatus: vi.fn().mockResolvedValue({ found: false, status: 404 }),
  allocatePanelDevice: vi.fn().mockResolvedValue({ id: 'lcd5' }),
  fetchPanelDevice: vi.fn().mockResolvedValue(null),
  fetchPanelDevices: (...a: unknown[]) => fetchPanelDevicesMock(...a),
  patchPanelDevice: (...a: unknown[]) => patchPanelDeviceMock(...a),
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: () => {},
  useMultiplex: () => ({ connected: true }),
}));
vi.mock('../../../panel/engine/panelSync', () => ({
  broadcastLayoutChanged: vi.fn(),
}));
vi.mock('../../../panel/theme/panelTheme', () => ({
  usePanelTheme: () => ({
    theme: { themeSyncWithDesktop: false, themeMode: 'dark', appThemeMode: 'dark', appResolvedThemeMode: 'dark', gaugeGradient: [] },
    commitThemeSync: vi.fn(), commitThemeMode: vi.fn(), commitAccentSync: vi.fn(),
    previewAccent: vi.fn(), commitAccent: vi.fn(), previewBackground: vi.fn(),
    commitBackground: vi.fn(), commitBackgroundMode: vi.fn(), commitBackgroundEffect: vi.fn(),
    commitBackgroundTemplate: vi.fn(), previewBackgroundEffectState: vi.fn(), commitBackgroundEffectState: vi.fn(),
    previewBackgroundOpacity: vi.fn(), commitBackgroundOpacity: vi.fn(), previewWidgetOpacity: vi.fn(),
    commitWidgetOpacity: vi.fn(), commitWidgetLabels: vi.fn(), commitBackgroundFrost: vi.fn(),
  }),
  buildPanelThemeVars: () => ({}),
  panelAccentColor: () => '#2563eb',
  useResolvedPanelThemeMode: () => 'dark',
}));
vi.mock('../../../panel/editor/PanelWidgetCatalog', () => ({
  PanelWidgetCatalog: (props: { onAdd: (type: string, size: string) => void; canAddSize?: (size: string) => boolean }) => (
    <button
      data-testid="catalog-add"
      data-can-add={props.canAddSize ? String(props.canAddSize('2x2')) : 'unchecked'}
      onClick={() => props.onAdd('cooling', '2x2')}
    >add</button>
  ),
  catalogEntriesFor: () => [],
}));
vi.mock('../../../panel/editor/PanelThemeSettings', () => ({
  PanelThemeSettings: ({ widgetScaleRow }: { widgetScaleRow?: React.ReactNode }) => (
    <div data-testid="theme">
      {widgetScaleRow}
      <span>widget padding</span>
    </div>
  ),
}));
vi.mock('../../../panel/widgets/registry', () => ({
  lookupApp: (type: string) => ({
    meta: { type, i18nKey: `name.${type}`, sizes: ['2x2', '2x4', '4x4'], defaultSize: '2x2', icon: () => null, touch: type === 'calculator' },
    Widget: () => <div data-testid="widget-preview" />,
    Settings: undefined,
  }),
  sizesForSurface: (_meta: unknown, surface: string, _touch?: boolean, slots?: number) => (
    slots !== undefined ? ['2x2', '2x4'] : surface === 'q60' ? ['2x4'] : ['2x2', '4x4']
  ),
  appAvailableForSurface: (meta: { touch?: boolean }, _surface: string, opts?: { deviceTouch?: boolean }) => !(meta.touch && opts?.deviceTouch !== true),
}));
vi.mock('./PanelEmbedFrame', () => ({
  PanelEmbedFrame: (props: { layout: PanelLayout; surface: string }) => (
    <div
      data-testid="embed"
      data-surface={props.surface}
      data-page-count={props.layout.pages.length}
      data-widget-count={props.layout.pages.flatMap(p => p.widgets).length}
    />
  ),
}));

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

function widget(id: string, type: string, col: number, row: number, size: PanelWidget['size'] = '2x2'): PanelWidget {
  return { id, type, size, col, row };
}

function layout(widgets: PanelWidget[], surface: PanelLayout['surface'] = 'monitor'): PanelLayout {
  return { layoutSchemaVersion: 2, surface, pages: [{ id: 'p1', widgets }], activePageId: 'p1' };
}

const GLACIAL_DEVICE: PanelDevice = {
  id: 'lcd-square:glacial',
  name: 'Glacial',
  connectionKind: 'attached-monitor',
  surfaceProfileKey: 'lcd-square',
  runtimeSurface: 'lcd-square',
  panelRecordId: 'lcd5',
  displayId: 'XMD00EA-1',
  previewSize: { width: 480, height: 480 },
  capabilities: { surface: 'lcd-square', touch: false } as PanelDevice['capabilities'],
} as PanelDevice;

const DEVICE: PanelDevice = {
  id: 'monitor:lcd5',
  name: 'iCUE LINK 5" LCD',
  connectionKind: 'attached-monitor',
  surfaceProfileKey: 'monitor-lcd5',
  runtimeSurface: 'monitor',
  panelRecordId: 'lcd5',
  displayId: 'XMD00EA-1',
  previewSize: { width: 720, height: 1280 },
  capabilities: { surface: 'monitor', touch: false } as PanelDevice['capabilities'],
} as PanelDevice;

function record(extra: Record<string, unknown>) {
  return {
    id: 'lcd5',
    displayId: 'XMD00EA-1',
    reserveMonitor: true,
    capabilities: { surface: 'monitor', family: 'icue-link-lcd5', cssWidth: 720, cssHeight: 1280, dpr: 1, dpi: 294, touch: false },
    ...extra,
  };
}

const patches = () => patchPanelDeviceMock.mock.calls.map(([, patch]) => patch as { widgetSize?: string; layout?: PanelLayout });

beforeEach(() => {
  fetchPanelDevicesMock.mockReset();
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
  pushToastMock.mockReset();
});

afterEach(() => vi.restoreAllMocks());

const sizeSlider = () => screen.getByRole('slider', { name: 'devices.panels.widgetSize.label' }) as HTMLInputElement;
// 'max' and 'min' are the slider's ends.
async function pickSize(mode: 'max' | 'min') {
  const slider = sizeSlider();
  await act(async () => {
    fireEvent.change(slider, { target: { value: mode === 'max' ? slider.max : slider.min } });
    fireEvent.keyUp(slider);
  });
  // The slider defers its drag-end commit one tick.
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
}

async function renderPage(rec: Record<string, unknown>, device: PanelDevice = DEVICE) {
  fetchPanelDevicesMock.mockResolvedValue({ devices: [record(rec)] });
  render(<PanelDevicePage device={device} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'devices.y70.tab.theme' }));
  await waitFor(() => expect(sizeSlider()).not.toBeDisabled());
}

describe('PanelDevicePage widget size', () => {
  it('renders the slider inside the Theme section, before Widget padding, with its description, and not on the Widgets tab', async () => {
    await renderPage({ widgetSize: 'large' });
    const theme = screen.getByTestId('theme');
    expect(theme.contains(sizeSlider())).toBe(true);
    const padding = screen.getByText('widget padding');
    expect(sizeSlider().compareDocumentPosition(padding) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('devices.panels.widgetSize.description')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'devices.y70.tab.widgets' }));
    expect(screen.queryByRole('slider', { name: 'devices.panels.widgetSize.label' })).toBeNull();
  });

  it('names the widgets that will not fit before switching to the one-tile size, then writes size and layout together', async () => {
    await renderPage({
      capabilities: { surface: 'lcd-square', family: 'asus-glacial-lcd', cssWidth: 480, cssHeight: 480, dpr: 1, dpi: 210, touch: false },
      widgetSize: 'small',
      layout: layout([widget('a', 'clock', 0, 0), widget('b', 'weather', 2, 0)]),
    }, GLACIAL_DEVICE);
    expect(sizeSlider().value).toBe(sizeSlider().min);

    await pickSize('max');

    expect(screen.getByText('devices.panels.widgetSize.confirmTitle')).toBeInTheDocument();
    expect(screen.getByText('name.weather')).toBeInTheDocument();
    expect(patches()).toHaveLength(0);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.panels.widgetSize.confirm' })); });

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].widgetSize).toBe('large');
    expect(patches()[0].layout?.pages.flatMap(p => p.widgets).map(w => w.type)).toEqual(['clock']);
    await waitFor(() => expect(screen.getByTestId('embed').dataset.surface).toBe('lcd-square'));
  });

  it('switches straight to the half size when everything fits, from a stored one-tile Large', async () => {
    await renderPage({
      capabilities: { surface: 'lcd-square', family: 'asus-glacial-lcd', cssWidth: 480, cssHeight: 480, dpr: 1, dpi: 210, touch: false },
      widgetSize: 'large',
      layout: layout([widget('a', 'clock', 0, 0, '2x4')], 'lcd-square'),
    }, GLACIAL_DEVICE);
    expect(screen.getByTestId('embed').dataset.surface).toBe('lcd-square');

    await pickSize('min');

    expect(screen.queryByText('devices.panels.widgetSize.confirmTitle')).not.toBeInTheDocument();
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].widgetSize).toBe('small');
    expect(screen.getByTestId('embed').dataset.surface).toBe('monitor');
    expect(screen.queryByRole('switch', { name: 'panel.playlist.playlist' })).not.toBeInTheDocument();
  });

  it('shows one error toast when the record write is refused or rejected', async () => {
    patchPanelDeviceMock.mockResolvedValue(null);
    await renderPage({ widgetSize: 'large', layout: layout([widget('a', 'clock', 0, 0, '2x4')], 'q60') });

    await pickSize('min');
    await waitFor(() => expect(pushToastMock).toHaveBeenCalledTimes(1));
    expect(pushToastMock).toHaveBeenCalledWith({ title: 'devices.panels.saveFailedTitle', body: 'devices.panels.saveFailedBody' });

    patchPanelDeviceMock.mockRejectedValue(new Error('network'));
    await pickSize('max');
    await waitFor(() => expect(patches().length).toBeGreaterThan(1));
    expect(pushToastMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a pointer-required widget when a mouse-only display changes size', async () => {
    await renderPage({ widgetSize: 'large', layout: layout([widget('a', 'calculator', 0, 0, '2x4')], 'q60') });

    await pickSize('min');

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].layout?.pages.flatMap(p => p.widgets).map(w => w.type)).toEqual(['calculator']);
  });

  it('shows no toast when the record write succeeds', async () => {
    await renderPage({ widgetSize: 'large', layout: layout([widget('a', 'clock', 0, 0, '2x4')], 'q60') });

    await pickSize('min');
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(pushToastMock).not.toHaveBeenCalled();
  });

  it('spills a full grid onto a second page for a display-bound panel without touch', async () => {
    const full = [0, 2, 4].flatMap(row => [widget(`l${row}`, 'clock', 0, row), widget(`r${row}`, 'weather', 2, row)]);
    await renderPage({ layout: layout(full) });
    fireEvent.click(screen.getByRole('tab', { name: 'devices.y70.tab.widgets' }));

    expect(screen.getByTestId('catalog-add').dataset.canAdd).toBe('unchecked');
    await act(async () => { fireEvent.click(screen.getByTestId('catalog-add')); });

    expect(screen.getByTestId('embed').dataset.pageCount).toBe('2');
  });

  it('on the Lian Li 8.8, 50% doubles the short-axis count and keeps every widget', async () => {
    const screen88 = {
      capabilities: { surface: 'monitor', family: 'lianli-screen88', cssWidth: 480, cssHeight: 1920, dpr: 1, dpi: 225, touch: false },
      layout: layout([
        widget('a', 'clock', 0, 0), widget('b', 'weather', 2, 0), widget('c', 'media', 0, 2),
        widget('d', 'monitoring', 2, 2), widget('e', 'stocks', 0, 4, '4x4'),
      ]),
    };
    await renderPage(screen88);
    // The default is 100%; the older forced two-column Large keeps its own 200% stop above it.
    // The slider runs over stop indices (even spacing); the row shows the percent label.
    expect(screen.getByRole('button', { name: 'devices.panels.widgetSize.label' })).toHaveTextContent('100%');
    expect(sizeSlider().min).toBe('0');
    expect(sizeSlider().step).toBe('1');
    expect(sizeSlider().value).toBe('2');
    expect(sizeSlider().max).toBe('3');
    expect(sizeSlider()).toHaveAttribute('aria-valuetext', '100%');

    await pickSize('min');

    expect(screen.queryByText('devices.panels.widgetSize.confirmTitle')).not.toBeInTheDocument();
    await waitFor(() => expect(patches()).toHaveLength(1));
    const written = patches()[0].layout?.pages.flatMap(p => p.widgets) ?? [];
    expect(patches()[0].widgetSize).toBe('compact');
    expect(written.map(w => w.type).sort()).toEqual(['clock', 'media', 'monitoring', 'stocks', 'weather']);
    expect(screen.getByTestId('embed').dataset.surface).toBe('monitor');
  });

  describe('a mouse-only display, which renders page one only', () => {
    const GENERIC: PanelDevice = {
      id: 'monitor:dell',
      name: 'Dell U2415',
      connectionKind: 'attached-monitor',
      surfaceProfileKey: 'monitor',
      runtimeSurface: 'monitor',
      panelRecordId: 'lcd5',
      displayId: 'DEL-1',
      previewSize: { width: 1920, height: 1200 },
      capabilities: { surface: 'monitor', touch: false } as PanelDevice['capabilities'],
    } as PanelDevice;
    const genericRecord = (widgetSize: string, widgets: PanelWidget[]) => ({
      capabilities: { surface: 'monitor', cssWidth: 1920, cssHeight: 1200, dpr: 1, dpi: 94, touch: false },
      displayId: 'DEL-1',
      widgetSize,
      layout: layout(widgets),
    });
    // A page of 2x2 widgets packed in reading order.
    const packed = (count: number, cols: number) =>
      Array.from({ length: count }, (_, i) => widget(`w${i}`, 'clock', (i % (cols / 2)) * 2, Math.floor(i / (cols / 2)) * 2));
    const pageIds = () => (patches().at(-1)?.layout?.pages ?? []).map(p => p.widgets.map(w => w.id));
    const removedNames = () => screen.queryAllByText('name.clock').length;

    it('asks before removing the widgets that no longer fit, and confirm removes only those, with no extra page', async () => {
      await renderPage(genericRecord('small', packed(40, 20)), GENERIC);
      const before = screen.getByTestId('embed').dataset.widgetCount;

      await pickSize('max');

      expect(screen.getByText('devices.panels.widgetSize.confirmTitle')).toBeInTheDocument();
      const listed = removedNames();
      expect(listed).toBeGreaterThan(0);
      expect(patches()).toHaveLength(0);

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.panels.widgetSize.confirm' })); });

      await waitFor(() => expect(patches()).toHaveLength(1));
      expect(patches()[0].widgetSize).toBe('large');
      const ids = pageIds();
      expect(ids).toHaveLength(1);
      expect(ids[0].length + listed).toBe(Number(before));
      const original = packed(40, 20).map(w => w.id);
      expect(new Set(ids[0]).size).toBe(ids[0].length);
      expect(ids[0].every(id => original.includes(id))).toBe(true);
    });

    it('cancel keeps the layout and the old scale', async () => {
      await renderPage(genericRecord('small', packed(40, 20)), GENERIC);

      await pickSize('max');
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' })); });

      expect(screen.queryByText('devices.panels.widgetSize.confirmTitle')).not.toBeInTheDocument();
      expect(patches()).toHaveLength(0);
      expect(screen.getByRole('button', { name: 'devices.panels.widgetSize.label' })).toHaveTextContent('100%');
      expect(screen.getByTestId('embed').dataset.widgetCount).toBe('40');
    });

    it('shows no confirm and keeps one page when everything still fits', async () => {
      await renderPage(genericRecord('small', packed(2, 20)), GENERIC);

      await pickSize('max');

      expect(screen.queryByText('devices.panels.widgetSize.confirmTitle')).not.toBeInTheDocument();
      await waitFor(() => expect(patches()).toHaveLength(1));
      expect(pageIds()).toEqual([['w0', 'w1']]);
    });
  });
});

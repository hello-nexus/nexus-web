import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PanelLayout, PanelWidget } from '../../../panel/types';
import { removeWidgetById } from '../../../panel/engine/panelLayoutOps';

// The y70 editor capacity (PanelDevicePage.editorCapacity), used by the iframe
// echo path below to mirror an on-device delete.
const Y70_EDITOR_CAP = { gridCols: 4, pageRows: 16 };

// Drive the real PanelDevicePage page-arrow derivation against a 3-page layout
// and a delete that prunes the active last page. Heavy leaves (catalog, theme,
// the iframe preview) are stubbed; the layout engine + arrow logic are real.

const fetchPanelDevicesMock = vi.fn();
const patchPanelDeviceMock = vi.fn();

vi.mock('../../../api/service', () => ({
  fetchService: vi.fn().mockResolvedValue(null),
  postService: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../api/displays', () => ({
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
    commitWidgetOpacity: vi.fn(), commitWidgetLabels: vi.fn(), commitWidgetBlur: vi.fn(),
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
// Stub the widget registry so the inline settings preview + normalize use a
// lightweight app def (the real CoolingWidget needs UiSettingsProvider).
vi.mock('../../../panel/widgets/registry', () => ({
  lookupApp: (type: string) => ({
    meta: { type, i18nKey: 'k', sizes: ['2x2', '4x4'], defaultSize: '2x2', icon: () => null },
    Widget: () => <div data-testid="widget-preview" />,
    Settings: undefined,
  }),
  sizesForSurface: () => ['2x2', '4x4'],
  appAvailableForSurface: () => true,
}));

// Stub the iframe preview: expose a click target per widget (Path A: opens the
// inline settings → trash) and a direct echo hook (Path B: iframe-side delete).
vi.mock('./PanelEmbedFrame', () => ({
  PanelEmbedFrame: (props: {
    layout: PanelLayout;
    onWidgetClicked: (w: PanelWidget) => void;
    onLayoutChange: (l: PanelLayout) => void;
  }) => (
    <div data-testid="embed">
      {props.layout.pages.flatMap(p => p.widgets).map(w => (
        <button key={w.id} data-testid={`click-${w.id}`} onClick={() => props.onWidgetClicked(w)}>{w.id}</button>
      ))}
      {props.layout.pages.flatMap(p => p.widgets).map(w => (
        // Path B: the iframe deletes on-device and echoes the new layout up.
        <button
          key={`echo-${w.id}`}
          data-testid={`echo-delete-${w.id}`}
          onClick={() => props.onLayoutChange(removeWidgetById(props.layout, w.id, Y70_EDITOR_CAP))}
        >{w.id}</button>
      ))}
    </div>
  ),
}));

import { PanelDevicePage } from './PanelDevicePage';
import type { PanelDevice } from '../../../panel/device/panelDevices';

function cool(id: string): PanelWidget {
  return { id, type: 'cooling', size: '2x2', col: 0, row: 0 };
}

const LAYOUT_3PAGES: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'y70',
  pages: [
    { id: 'p1', widgets: [cool('a')] },
    { id: 'p2', widgets: [cool('b')] },
    { id: 'p3', widgets: [cool('c')] },
  ],
  activePageId: 'p1',
};

const DEVICE: PanelDevice = {
  id: 'dev1',
  name: 'Y70',
  connectionKind: 'simulated',
  surfaceProfileKey: 'y70',
  runtimeSurface: 'y70',
  capabilities: { surface: 'y70', touch: true } as PanelDevice['capabilities'],
} as PanelDevice;

beforeEach(() => {
  fetchPanelDevicesMock.mockReset();
  patchPanelDeviceMock.mockReset().mockResolvedValue({ ok: true });
  fetchPanelDevicesMock.mockResolvedValue({
    devices: [{ id: 'dev1', capabilities: { surface: 'y70', touch: true }, layout: LAYOUT_3PAGES, reserveMonitor: true }],
  });
});

afterEach(() => vi.restoreAllMocks());

const prevDisabled = () => (screen.getByLabelText('devices.panels.prevPage') as HTMLButtonElement).disabled;
const nextDisabled = () => (screen.getByLabelText('devices.panels.nextPage') as HTMLButtonElement).disabled;

async function loadAndGoToLastPage() {
  render(<PanelDevicePage device={DEVICE} />);
  await waitFor(() => screen.getByLabelText('devices.panels.nextPage'));
  // Navigate p1 -> p3 via the desktop next arrow.
  await act(async () => { fireEvent.click(screen.getByLabelText('devices.panels.nextPage')); });
  await act(async () => { fireEvent.click(screen.getByLabelText('devices.panels.nextPage')); });
  await waitFor(() => expect(nextDisabled()).toBe(true)); // on last page (index 2 of 3)
  expect(prevDisabled()).toBe(false);
}

describe('PanelDevicePage page arrows after deleting the last widget on the last page', () => {
  it('Path A (inline settings trash): left arrow stays enabled, right disabled', async () => {
    await loadAndGoToLastPage();
    // Open the widget's inline settings, then remove it.
    await act(async () => { fireEvent.click(screen.getByTestId('click-c')); });
    await waitFor(() => screen.getByLabelText('devices.panels.widgetSettings.remove'));
    await act(async () => { fireEvent.click(screen.getByLabelText('devices.panels.widgetSettings.remove')); });
    // Now 2 pages remain, showing page 2 (index 1): can still go left, not right.
    await waitFor(() => {
      expect(prevDisabled()).toBe(false);
      expect(nextDisabled()).toBe(true);
    });
  });

  it('Path B (iframe echoes an on-device delete): left arrow stays enabled, right disabled', async () => {
    await loadAndGoToLastPage();
    await act(async () => { fireEvent.click(screen.getByTestId('echo-delete-c')); });
    await waitFor(() => {
      expect(prevDisabled()).toBe(false);
      expect(nextDisabled()).toBe(true);
    });
  });
});

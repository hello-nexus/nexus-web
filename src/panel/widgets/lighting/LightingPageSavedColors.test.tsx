import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';

const devicesRef = vi.hoisted(() => ({ current: [] as unknown[] }));
const mockPut = vi.hoisted(() => vi.fn());
const mockSetPins = vi.hoisted(() => vi.fn(() => Promise.resolve(true)));
const pinsRef = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

const lightingSync = vi.hoisted(() => ({
  mode: 'animate',
  setMode: vi.fn(),
  rawSync: 'fire',
  setRawSync: vi.fn(),
  synced: true,
  paused: false,
}));

vi.mock('../../../hooks/useLightingSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useLightingSync')>()),
  useLightingSync: () => lightingSync,
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
  useTopic: vi.fn(() => null),
}));
vi.mock('../../../hooks/useLightingFrames', () => ({
  useLightingFrames: () => ({ connected: false, live: false }),
}));
vi.mock('../../../hooks/useUsbDevices', () => ({ useUsbDevices: () => ({ devices: [] }) }));
vi.mock('../../../hooks/useAudioState', () => ({ useAudioState: () => ({ current: null }) }));
vi.mock('../../../lib/controlSync', () => ({
  publishControlSync: vi.fn(),
  subscribeControlSync: vi.fn(() => () => {}),
}));

vi.mock('./page/AnimateGrid', () => ({ AnimateGrid: () => null }));
vi.mock('./page/FullscreenShader', () => ({ FullscreenShader: () => null }));
vi.mock('./page/ModeControls', () => ({ ModeControls: () => null }));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
vi.mock('./page/RightPaneTabs', () => ({ RightPaneTabs: () => null }));
vi.mock('./page/EffectTab', () => ({ EffectTab: () => null }));
vi.mock('../../../components/common/ViewHeader/ViewHeader', async () => {
  const { Tabs } = await import('../../../components/common/Tabs/Tabs');
  return {
    ViewHeader: ({ tabs, activeTab, onTabChange }: { tabs?: never[]; activeTab?: string; onTabChange?: (key: string, el: HTMLButtonElement) => void }) => (
      tabs ? <Tabs tabs={tabs} activeKey={activeTab ?? ''} onChange={onTabChange ?? (() => {})} /> : null
    ),
  };
});
vi.mock('../../../lib/i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../lib/i18n')>()),
  useTranslation: () => ({
    language: 'en',
    setLanguage: () => {},
    t: (key: string, params?: Record<string, string>) => params ? `${key}|${Object.entries(params).map(([k, v]) => `${k}=${v}`).join('|')}` : key,
  }),
}));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => null }));


const decksRef = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock('../../../hooks/useStreamDecks', () => ({ useStreamDecks: () => ({ decks: decksRef.current }) }));

vi.mock('../../../api/service', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/service')>()),
  fetchService: vi.fn((url: string) => Promise.resolve(url === '/devices/lianli-flex/lighting'
    ? { laneModes: [], chains: [{ mac: 'AA11', mode: 'rainbow' }] }
    : null)),
  putService: (...args: unknown[]) => mockPut(...args),
}));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'fire' })),
    fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'fire', states: {}, templates: {} })),
    fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'checker', states: {} })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
    cachedAnimateDefaults: vi.fn(() => null),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: devicesRef.current })),
    fetchPins: vi.fn(() => Promise.resolve(pinsRef.current)),
    setPins: (...args: unknown[]) => mockSetPins(...args),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
  };
});

const serviceState = { cooling: null, lighting: null, panel: null } as never;

const base = { type: 'ledstrip', ledsOn: true, controlled: true, brightness: 100, hue: 0, saturation: 1, ledCount: 87, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0 };
const keyboard = { ...base, id: 'kb', name: 'Galleon 100 SD', iconType: 'keyboard', deviceId: 'corsair-galleon:CC1FE9FF494BD652A4EA3DCFA2B70CBA', saveToDeviceSupported: true, savedToDevice: true };
const fan = { ...base, id: 'fan', name: 'Case Fan', iconType: 'fan' };

function renderPage() {
  localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
  render(
    <UiSettingsProvider>
      <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform="windows" onSectionNavigate={vi.fn()} />
    </UiSettingsProvider>,
  );
}

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });

describe('LightingPage saved-colors keyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    lightingSync.mode = 'animate';
    pinsRef.current = {};
    devicesRef.current = [keyboard, fan];
    decksRef.current = [{ serial: 'EA3DCFA2B70CBA', displayName: 'Corsair Galleon 100 SD' }];
  });

  it('leaves every tab open with nothing selected', async () => {
    renderPage();
    await screen.findByText('Galleon 100 SD');
    expect(tab('lighting.mode.animate').getAttribute('aria-disabled')).toBeNull();
    expect(tab('lighting.mode.screen').getAttribute('aria-disabled')).toBeNull();
  });

  it('forces the Static view and blocks the other tabs while the keyboard is selected', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Galleon 100 SD'));
    await waitFor(() => expect(tab('lighting.mode.animate').getAttribute('aria-disabled')).toBe('true'));
    expect(tab('lighting.mode.screen').getAttribute('aria-disabled')).toBe('true');
    expect(tab('lighting.mode.gif').getAttribute('aria-disabled')).toBe('true');
    expect(tab('lighting.mode.static').getAttribute('aria-disabled')).toBeNull();
    // The global mode is Animation; the open tab is still Static.
    expect(tab('lighting.mode.static').getAttribute('aria-selected')).toBe('true');
    expect(tab('lighting.mode.animate').getAttribute('aria-selected')).toBe('false');
  });

  it('ignores a press on a blocked tab', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Galleon 100 SD'));
    await waitFor(() => expect(tab('lighting.mode.animate').getAttribute('aria-disabled')).toBe('true'));
    const modeCalls = lightingSync.setMode.mock.calls.length;
    fireEvent.click(tab('lighting.mode.animate'));
    expect(lightingSync.setMode.mock.calls.length).toBe(modeCalls);
    expect(mockSetPins).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'animate' }));
  });

  it('keeps the blocked tab focusable so its tooltip names the keyboard and the Static tab', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Galleon 100 SD'));
    const animate = tab('lighting.mode.animate');
    await waitFor(() => expect(animate.getAttribute('aria-disabled')).toBe('true'));
    expect((animate as HTMLButtonElement).disabled).toBe(false);
    fireEvent.focus(animate);
    expect(await screen.findByText('lighting.mode.savedColorsOnly|name=Galleon 100 SD|static=lighting.mode.static')).toBeTruthy();
  });

  it('names only the keyboard when the selection is mixed', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('Case Fan'));
    await waitFor(() => expect(tab('lighting.mode.animate').getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(screen.getByText('Galleon 100 SD'), { ctrlKey: true, metaKey: true });
    await waitFor(() => expect(tab('lighting.mode.animate').getAttribute('aria-disabled')).toBe('true'));
    fireEvent.focus(tab('lighting.mode.animate'));
    expect(await screen.findByText('lighting.mode.savedColorsOnly|name=Galleon 100 SD|static=lighting.mode.static')).toBeTruthy();
  });

  it('disables the pause toggle on the blocked Animation tab', async () => {
    renderPage();
    const pause = await screen.findByRole('button', { name: 'lighting.pause' });
    expect(pause.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(await screen.findByText('Galleon 100 SD'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'lighting.pause' }).getAttribute('aria-disabled')).toBe('true'));
  });

  it('shows the saved-colors note on the card while the global look is animated, and not once pinned static', async () => {
    renderPage();
    expect(await screen.findByText('lighting.devices.saveStrip.animated')).toBeTruthy();
    expect(screen.queryByText('lighting.devices.saveStrip.limit')).toBeNull();
  });

  it('pins a saved keyboard to the static look it wears when the global mode is static', async () => {
    lightingSync.mode = 'static';
    renderPage();
    await waitFor(() => expect(mockSetPins).toHaveBeenCalledWith(['kb'], expect.objectContaining({ kind: expect.stringMatching(/static|color/) })));
    expect(mockSetPins.mock.calls.every(c => (c as unknown[][])[0].join() === 'kb')).toBe(true);
  });

  it('does not pin a saved keyboard while the global look is animated', async () => {
    renderPage();
    await screen.findByText('Galleon 100 SD');
    expect(mockSetPins).not.toHaveBeenCalled();
  });
});

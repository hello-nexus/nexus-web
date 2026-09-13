import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStaticDeviceLooks, setStaticDeviceLock } from '../../../api/lighting';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { LightingPage } from './LightingPage';

const topicHandlers = vi.hoisted(() => ({ lighting: [] as (() => void)[] }));

vi.mock('../../../hooks/useLightingSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useLightingSync')>()),
  useLightingSync: () => ({
    mode: 'static',
    setMode: vi.fn(),
    rawSync: 'static',
    setRawSync: vi.fn(),
    synced: true,
    paused: false,
  }),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, cb: () => void) => {
    if (topic === 'lighting' && enabled && !topicHandlers.lighting.includes(cb)) {
      topicHandlers.lighting.push(cb);
    }
  },
  useTopic: vi.fn(() => null),
}));

vi.mock('../../../hooks/useLightingFrames', () => ({
  useLightingFrames: () => ({ canvasPixels: null, canvasW: 160, canvasH: 90 }),
}));
vi.mock('../../../hooks/useUsbDevices', () => ({ useUsbDevices: () => ({ devices: [] }) }));
vi.mock('../../../hooks/useAudioState', () => ({ useAudioState: () => ({ current: null }) }));
vi.mock('../../../lib/controlSync', () => ({
  publishControlSync: vi.fn(),
  subscribeControlSync: vi.fn(() => () => {}),
}));

// The selection the page hands the grid is the thing that regressed, so the
// stub renders it instead of the real cells.
vi.mock('./page/AnimateGrid', () => ({
  AnimateGrid: ({ effect, onSelect }: { effect: string; onSelect?: (key: string) => void }) => (
    <div data-testid="grid-effect" onClick={() => onSelect?.('stripes')}>{effect}</div>
  ),
}));
vi.mock('./page/FullscreenShader', () => ({ FullscreenShader: () => null }));
vi.mock('./page/ModeControls', () => ({ ModeControls: () => null }));
// The stub exposes exactly what the lock rides on: the pick the rail is handed
// (locked or not) and the toggle callback.
vi.mock('./page/DevicePanel', () => ({
  DevicePanel: ({ devicePicks, lockable, onSetLock, lockFlash, onSetSelection }: {
    devicePicks?: Record<string, { locked?: boolean }>;
    lockable?: boolean;
    onSetLock?: (ids: string[], locked: boolean) => void;
    lockFlash?: { ids: ReadonlySet<string>; seq: number };
    onSetSelection: (ids: Set<string>, primary: string | null) => void;
  }) => (
    <div
      data-testid="rail"
      data-lockable={String(!!lockable)}
      data-locked={String(!!devicePicks?.a?.locked)}
      data-haspick={String(!!devicePicks?.a)}
      data-flash={`${lockFlash?.seq ?? 0}:${[...(lockFlash?.ids ?? [])].join(',')}`}
    >
      <button type="button" onClick={() => onSetLock?.(['a'], !devicePicks?.a?.locked)}>toggle</button>
      <button type="button" onClick={() => onSetSelection(new Set(['a']), 'a')}>select-a</button>
    </div>
  ),
}));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
vi.mock('./page/RightPaneTabs', () => ({ RightPaneTabs: () => null }));
vi.mock('./page/EffectTab', () => ({ EffectTab: () => null }));
vi.mock('../../../components/common/ViewHeader/ViewHeader', () => ({ ViewHeader: () => null }));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/views/PageSkeleton/PageSkeleton', () => ({ LightingSkeleton: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => null }));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'static' })),
    // The animate side remembers a different effect; it must not win in static.
    fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'fire', states: {}, templates: {} })),
    fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'checker', states: {} })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
    cachedAnimateDefaults: vi.fn(() => null),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: [] })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
    saveAnimateTemplates: vi.fn(() => Promise.resolve(null)),
    startAnimate: vi.fn(() => Promise.resolve(null)),
    startStatic: vi.fn(() => Promise.resolve(null)),
    stopLighting: vi.fn(() => Promise.resolve(null)),
    setMusicReactive: vi.fn(() => Promise.resolve(null)),
    setStaticDeviceLock: vi.fn(() => Promise.resolve(true)),
    // Rejects like a service that is not there, so the mount sync leaves the
    // stored picks alone; the broadcast test swaps in real looks.
    fetchStaticDeviceLooks: vi.fn(() => Promise.reject(new Error('offline'))),
  };
});

const serviceState = { cooling: null, lighting: null, panel: null } as never;

const renderPage = () => render(
  <UiSettingsProvider>
    <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" />
  </UiSettingsProvider>,
);

describe('LightingPage color lock', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
    localStorage.setItem('nexus.lighting.devicePicks', JSON.stringify({ a: { key: 'flat:red-3', slot: 0, hex: '#ff0000' } }));
    vi.mocked(setStaticDeviceLock).mockClear();
    vi.mocked(setStaticDeviceLock).mockImplementation(() => Promise.resolve(true));
    vi.mocked(fetchStaticDeviceLooks).mockImplementation(() => Promise.reject(new Error('offline')));
    topicHandlers.lighting.length = 0;
  });

  it('flips the card at once and tells the service', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('rail').dataset.lockable).toBe('true'));
    expect(screen.getByTestId('rail').dataset.locked).toBe('false');

    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('rail').dataset.locked).toBe('true');
    expect(setStaticDeviceLock).toHaveBeenCalledWith('a', true);

    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('rail').dataset.locked).toBe('false');
    expect(setStaticDeviceLock).toHaveBeenLastCalledWith('a', false);
  });

  it('takes a lock set by another client off the lighting broadcast, keeping its own pick', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('rail').dataset.haspick).toBe('true'));
    expect(screen.getByTestId('rail').dataset.locked).toBe('false');

    vi.mocked(fetchStaticDeviceLooks).mockImplementation(() => Promise.resolve({
      looks: { a: { effect: 'flat', color: '#00ff00', intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, slot: 0, locked: true } },
    }));
    topicHandlers.lighting.forEach(cb => cb());
    await waitFor(() => expect(screen.getByTestId('rail').dataset.locked).toBe('true'));
    // The flag came over; the pick record itself was not replaced.
    const picks = JSON.parse(localStorage.getItem('nexus.lighting.devicePicks') ?? '{}') as Record<string, { hex: string }>;
    expect(picks.a.hex).toBe('#ff0000');
  });

  it('flashes the badge of a locked, selected card when a pick is aimed at it', async () => {
    localStorage.setItem('nexus.lighting.devicePicks', JSON.stringify({ a: { key: 'flat:red-3', slot: 0, hex: '#ff0000', locked: true } }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('rail').dataset.locked).toBe('true'));
    expect(screen.getByTestId('rail').dataset.flash).toBe('0:');

    fireEvent.click(screen.getByText('select-a'));
    fireEvent.click(screen.getByTestId('grid-effect'));
    await waitFor(() => expect(screen.getByTestId('rail').dataset.flash).toBe('1:a'));
    // Still locked, still the old pick: the flash was the whole outcome.
    expect(screen.getByTestId('rail').dataset.locked).toBe('true');
    const picks = JSON.parse(localStorage.getItem('nexus.lighting.devicePicks') ?? '{}') as Record<string, { key: string }>;
    expect(picks.a.key).toBe('flat:red-3');
  });

  it('puts the record back when the service refuses', async () => {
    // The API layer never rejects: a 404 / 409 / missing route all resolve false.
    vi.mocked(setStaticDeviceLock).mockImplementation(() => Promise.resolve(false));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('rail').dataset.haspick).toBe('true'));

    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('rail').dataset.locked).toBe('true');
    expect(setStaticDeviceLock).toHaveBeenCalledWith('a', true);
    await waitFor(() => expect(screen.getByTestId('rail').dataset.locked).toBe('false'));
  });
});

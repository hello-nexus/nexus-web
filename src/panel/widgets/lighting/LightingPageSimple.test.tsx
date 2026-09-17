import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { PALETTE } from '../../../types/lightingPalette';
import * as lightingApi from '../../../api/lighting';
import { LightingPage } from './LightingPage';
import { SIMPLE_ANIMATION_KEYS } from './simpleAnimations';

// Rendered outside I18nProvider, so t() falls back to raw keys.

const syncState = vi.hoisted(() => ({ mode: 'none', rawSync: '' }));
vi.mock('../../../hooks/useLightingSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useLightingSync')>()),
  useLightingSync: () => ({
    mode: syncState.mode,
    setMode: vi.fn(),
    rawSync: syncState.rawSync || syncState.mode,
    setRawSync: vi.fn(),
    synced: true,
    paused: false,
  }),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: vi.fn(),
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

vi.mock('./page/FullscreenShader', () => ({ FullscreenShader: () => null }));
vi.mock('./page/ModeControls', () => ({ ModeControls: () => null }));
// Advanced-branch marker: the simple page never mounts the device rail.
vi.mock('./page/DevicePanel', () => ({ DevicePanel: () => <div data-testid="device-panel" /> }));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
vi.mock('./page/EffectTab', () => ({ EffectTab: () => null }));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/views/PageSkeleton/PageSkeleton', () => ({ LightingSkeleton: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => null }));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'none' })),
    fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'rainbow', states: {}, templates: {} })),
    fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'gradientlinear', states: {} })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
    cachedAnimateDefaults: vi.fn(() => null),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({
      isInit: true,
      devices: [
        { id: 'dev-1', name: 'Strip', ledsOn: true, ledCount: 8, x: 0, y: 0, w: 1, h: 1 },
        { id: 'dev-2', name: 'Fan', ledsOn: true, ledCount: 8, controlled: false, x: 0, y: 0, w: 1, h: 1 },
      ],
    })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
    saveAnimateTemplates: vi.fn(() => Promise.resolve(null)),
    startAnimate: vi.fn(() => Promise.resolve(null)),
    startStatic: vi.fn(() => Promise.resolve(null)),
    stopLighting: vi.fn(() => Promise.resolve(null)),
    setMusicReactive: vi.fn(() => Promise.resolve(null)),
    setLightingDeviceColor: vi.fn(() => Promise.resolve(null)),
    setLightingDeviceControlled: vi.fn(() => Promise.resolve(null)),
  };
});

const serviceState = { cooling: null, lighting: null, panel: null } as never;

function renderPage() {
  return render(
    <UiSettingsProvider>
      <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" />
    </UiSettingsProvider>,
  );
}

describe('LightingPage simple mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fresh install: no stored settings, both page modes default to 'simple'.
    localStorage.clear();
    syncState.mode = 'none';
    syncState.rawSync = '';
  });

  it('renders the whole colour palette and no advanced chrome', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('[data-palette-id]').length).toBe(PALETTE.length);
    expect(screen.queryByTestId('device-panel')).toBeNull();
    // Simple mode carries the mode tab and nothing after it.
    expect(screen.getAllByRole('tab')).toHaveLength(1);
  });

  it('offers no gradient, two-tone or spectrum pattern', () => {
    renderPage();
    for (const key of ['gradientlinear', 'gradientradial', 'twotone', 'spectrumramp', 'huewheel']) {
      expect(screen.queryByRole('button', { name: new RegExp(`lighting\\.effect\\.${key}\\b`) })).toBeNull();
    }
  });

  it('summarises how many devices are driven out of the total', async () => {
    syncState.mode = 'static';
    renderPage();
    expect(await screen.findByText('lighting.simple.controlledOf.other')).toBeTruthy();
  });

  // The same line, in the same place: what Off did instead of a count nothing
  // is driving.
  it('states that lighting is off instead of counting devices, while off', async () => {
    renderPage();
    expect(await screen.findByText('lighting.off.message')).toBeTruthy();
    expect(screen.queryByText('lighting.simple.controlledOf.other')).toBeNull();
    expect(screen.queryByRole('button', { name: 'lighting.simple.controlAll' })).toBeNull();
  });

  it('offers a one-click claim while a device is left un-driven, and drops it once none are', async () => {
    syncState.mode = 'static';
    renderPage();
    const claim = await screen.findByRole('button', { name: 'lighting.simple.controlAll' });
    fireEvent.click(claim);
    await waitFor(() => {
      expect(vi.mocked(lightingApi.setLightingDeviceControlled)).toHaveBeenCalledWith('dev-2', true);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'lighting.simple.controlAll' })).toBeNull();
    });
  });

  it('takes over a device the advanced page had left un-driven, when asked to light one', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    // Arriving here changes nothing: the view is not a decision about which
    // devices Nexus drives.
    expect(vi.mocked(lightingApi.setLightingDeviceControlled)).not.toHaveBeenCalled();

    const swatch = container.querySelector('[data-palette-id="red-3"]') as HTMLButtonElement;
    fireEvent.click(swatch);

    await waitFor(() => {
      expect(vi.mocked(lightingApi.setLightingDeviceControlled)).toHaveBeenCalledWith('dev-2', true);
    });
    // The already-driven device is left alone.
    expect(vi.mocked(lightingApi.setLightingDeviceControlled).mock.calls.some(c => c[0] === 'dev-1')).toBe(false);
  });

  it('paints every device with a picked colour, entering static first', async () => {
    const { container } = renderPage();
    // Wait for the device fetch: a colour has nowhere to land until it lands.
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    const swatch = container.querySelector('[data-palette-id="red-3"]') as HTMLButtonElement;
    fireEvent.click(swatch);
    await waitFor(() => {
      expect(vi.mocked(lightingApi.startStatic)).toHaveBeenCalled();
      expect(vi.mocked(lightingApi.setLightingDeviceColor).mock.calls.some(c => c[0] === 'dev-1')).toBe(true);
    });
  });

  it('the mode menu stops lighting when a mode is running', async () => {
    syncState.mode = 'static';
    renderPage();
    fireEvent.click(screen.getByRole('tab'));
    const off = screen.getByRole('menuitemradio', { name: /lighting\.mode\.off/ });
    expect(off.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(off);
    await waitFor(() => {
      expect(vi.mocked(lightingApi.stopLighting)).toHaveBeenCalled();
    });
  });

  it('marks Off in the menu and does not restart the stop while already off', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab'));
    const off = screen.getByRole('menuitemradio', { name: /lighting\.mode\.off/ });
    expect(off.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(off);
    expect(vi.mocked(lightingApi.stopLighting)).not.toHaveBeenCalled();
  });

  it('says a custom setup is active when the mode has no tile on the page', async () => {
    syncState.mode = 'animate';
    renderPage();
    expect(await screen.findByText('lighting.simple.customActive')).toBeTruthy();
  });

  it('says nothing while lighting is off', async () => {
    renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    expect(screen.queryByText('lighting.simple.customActive')).toBeNull();
  });

  it('offers the animation row under the palette, one tile per sweep', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('[data-effect-key^="sweep"]').length)
      .toBe(SIMPLE_ANIMATION_KEYS.length);
  });

  it('starts a picked animation on every device, claiming the un-driven one', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    fireEvent.click(container.querySelector('[data-effect-key="sweepbars"]') as HTMLButtonElement);
    await waitFor(() => {
      expect(vi.mocked(lightingApi.startAnimate)).toHaveBeenCalledWith('sweepbars', 50, 1, 0, 0, 1, 1, {});
    });
    expect(vi.mocked(lightingApi.setLightingDeviceControlled)).toHaveBeenCalledWith('dev-2', true);
    // A sweep is one shared canvas: no per-device colour is written for it.
    expect(vi.mocked(lightingApi.setLightingDeviceColor)).not.toHaveBeenCalled();
  });

  it('turns the running sweep around from the direction switch', async () => {
    syncState.mode = 'animate';
    syncState.rawSync = 'sweeprainbow';
    renderPage();
    fireEvent.click(screen.getByRole('switch', { name: 'lighting.simple.reverse' }));
    await waitFor(() => {
      expect(vi.mocked(lightingApi.startAnimate)).toHaveBeenCalledWith('sweeprainbow', -50, 1, 0, 0, 1, 1, {});
    });
  });

  it('marks the running sweep and does not call it a custom setup', async () => {
    syncState.mode = 'animate';
    syncState.rawSync = 'sweepink';
    const { container } = renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    const tile = container.querySelector('[data-effect-key="sweepink"]') as HTMLButtonElement;
    expect(tile.className).toContain('cardActive');
    expect(screen.queryByText('lighting.simple.customActive')).toBeNull();
  });

  it('switches to the advanced page from the mode menu', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab'));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /uiMode\.advancedMode/ }));
    await waitFor(() => {
      expect(screen.getByTestId('device-panel')).toBeTruthy();
    });
    // The advanced page's own tab strip: the mode tab plus every mode after it.
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(1);
  });
});

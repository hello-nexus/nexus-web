import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { loadSettings } from '../../../lib/settings';
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
  useLightingFrames: () => ({ connected: false, live: false }),
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
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({ DeviceCanvas: () => null }));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'none' })),
    fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'rainbow', states: {}, templates: {} })),
    fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'gradientlinear', states: {} })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve({})),
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
    setPins: vi.fn(() => Promise.resolve(true)),
    fetchPins: vi.fn(() => Promise.resolve({})),
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
    vi.mocked(lightingApi.fetchStaticSettings).mockResolvedValue({ effect: 'gradientlinear', states: {} });
    // Tests below override these; put the file defaults back so order never matters.
    vi.mocked(lightingApi.fetchAnimateSettings).mockResolvedValue({ effect: 'rainbow', states: {}, templates: {} } as never);
    vi.mocked(lightingApi.fetchAnimateDefaults).mockResolvedValue({});
    vi.mocked(lightingApi.saveAnimateTemplates).mockResolvedValue(null as never);
    vi.mocked(lightingApi.startAnimate).mockResolvedValue(null as never);
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
    const claim = await screen.findByRole('button', { name: 'lighting.controlAllDevices' });
    fireEvent.click(claim);
    await waitFor(() => {
      expect(vi.mocked(lightingApi.setLightingDeviceControlled)).toHaveBeenCalledWith('dev-2', true);
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'lighting.controlAllDevices' })).toBeNull();
    });
  });

  it('leaves a device the advanced page had left un-driven alone, when asked to light one', async () => {
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
      expect(vi.mocked(lightingApi.startStatic)).toHaveBeenCalled();
    });
    expect(vi.mocked(lightingApi.setLightingDeviceControlled)).not.toHaveBeenCalled();
  });

  it('runs a picked color as the exact global color, entering static first', async () => {
    const { container } = renderPage();
    // Wait for the device fetch: a colour has nowhere to land until it lands.
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    const swatch = container.querySelector('[data-palette-id="red-3"]') as HTMLButtonElement;
    fireEvent.click(swatch);
    await waitFor(() => {
      expect(vi.mocked(lightingApi.startStatic)).toHaveBeenCalled();
      expect(vi.mocked(lightingApi.startStatic).mock.calls.some(c => c[8] === PALETTE.find(p => p.id === 'red-3')!.hex)).toBe(true);
    });
    expect(vi.mocked(lightingApi.setPins)).not.toHaveBeenCalled();
  });

  it('marks the swatch the exact global color matches', async () => {
    syncState.mode = 'static';
    vi.mocked(lightingApi.fetchStaticSettings).mockResolvedValue({ effect: 'gradientlinear', states: {}, color: PALETTE.find(p => p.id === 'blue-3')!.hex });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-palette-id="blue-3"]')?.getAttribute('aria-pressed')).toBe('true');
    });
    expect(container.querySelector('[data-palette-id="red-3"]')?.getAttribute('aria-pressed')).toBe('false');
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

  it('records a picked color and a picked animation as recents', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    fireEvent.click(container.querySelector('[data-palette-id="red-3"]') as HTMLButtonElement);
    fireEvent.click(container.querySelector('[data-effect-key="sharplines"]') as HTMLButtonElement);
    await waitFor(() => {
      const general = loadSettings().general;
      expect(general.recentStaticColors).toEqual([PALETTE.find(p => p.id === 'red-3')!.hex]);
      expect(general.recentAnimations).toEqual(['sharplines']);
    });
  });

  it('offers the animation row under the palette, one tile per animation', () => {
    const { container } = renderPage();
    for (const key of SIMPLE_ANIMATION_KEYS) {
      expect(container.querySelectorAll(`[data-effect-key="${key}"]`).length).toBe(1);
    }
  });

  it('starts a picked animation without retaking the un-driven device', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    fireEvent.click(container.querySelector('[data-effect-key="sharplines"]') as HTMLButtonElement);
    await waitFor(() => {
      expect(vi.mocked(lightingApi.startAnimate)).toHaveBeenCalledWith('sharplines', 50, 1, 0, 0, 1, 1, {}, true, undefined);
    });
    expect(vi.mocked(lightingApi.setLightingDeviceControlled)).not.toHaveBeenCalled();
    // One shared canvas: nothing is pinned for it.
    expect(vi.mocked(lightingApi.setPins)).not.toHaveBeenCalled();
  });

  // Preset 1 as it resolves (defaults merged with the user's slot 0 edit) is the
  // look simple mode runs, and the effect's selection moves to it.
  it('selects slot 0 and runs its resolved look, leaving the other slots alone', async () => {
    const slot = (speed: number) => ({ speed, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, params: {} });
    const saved = {
      selected: 2,
      slots: [{ ...slot(30), params: { u_density: 4 } }, slot(61), slot(62), slot(63)],
    };
    vi.mocked(lightingApi.fetchAnimateSettings).mockResolvedValue({
      effect: 'rainbow', states: {}, templates: { sharplines: saved },
    } as never);
    const { container } = renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    fireEvent.click(container.querySelector('[data-effect-key="sharplines"]') as HTMLButtonElement);
    await waitFor(() => {
      expect(vi.mocked(lightingApi.startAnimate)).toHaveBeenCalledWith('sharplines', 30, 1, 0, 0, 1, 1, { u_density: 4 }, true, undefined);
    });
    await waitFor(() => {
      expect(vi.mocked(lightingApi.saveAnimateTemplates)).toHaveBeenCalled();
    });
    const sent = vi.mocked(lightingApi.saveAnimateTemplates).mock.calls.at(-1)![0] as Record<string, typeof saved>;
    expect(sent.sharplines.selected).toBe(0);
    expect(sent.sharplines.slots.map(x => x.speed)).toEqual([30, 61, 62, 63]);
  });

  it('turns the running animation around by negating slot 0 speed only', async () => {
    syncState.mode = 'animate';
    syncState.rawSync = 'rainbow';
    renderPage();
    fireEvent.click(screen.getByRole('switch', { name: 'lighting.simple.reverse' }));
    await waitFor(() => {
      expect(vi.mocked(lightingApi.startAnimate)).toHaveBeenCalledWith('rainbow', -50, 1, 0, 0, 1, 1, {}, true, undefined);
    });
    // The sign is the running state: no template is written for it.
    expect(vi.mocked(lightingApi.saveAnimateTemplates)).not.toHaveBeenCalled();
  });

  // The service re-applies the selected preset when the selection is saved, so a
  // reversed start sent before the save lands would be overwritten with the
  // forward speed.
  it('saves the slot 0 selection before starting a reversed animation', async () => {
    const slot = (speed: number) => ({ speed, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, params: {} });
    vi.mocked(lightingApi.fetchAnimateSettings).mockResolvedValue({
      effect: 'rainbow', states: {}, templates: { sharplines: { selected: 1, slots: [slot(30), slot(60), slot(60), slot(60)] } },
    } as never);
    const order: string[] = [];
    let releaseSave: () => void = () => {};
    vi.mocked(lightingApi.saveAnimateTemplates).mockImplementation(() => new Promise(resolve => {
      order.push('save');
      releaseSave = () => { order.push('saved'); resolve(null as never); };
    }));
    vi.mocked(lightingApi.startAnimate).mockImplementation(() => { order.push('start'); return Promise.resolve(null as never); });
    const { container } = renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    fireEvent.click(screen.getByRole('switch', { name: 'lighting.simple.reverse' }));
    fireEvent.click(container.querySelector('[data-effect-key="sharplines"]') as HTMLButtonElement);
    await waitFor(() => expect(order).toContain('save'));
    expect(order).not.toContain('start');
    releaseSave();
    await waitFor(() => expect(order).toContain('start'));
    expect(order).toEqual(['save', 'saved', 'start']);
    expect(vi.mocked(lightingApi.startAnimate)).toHaveBeenCalledWith('sharplines', -30, 1, 0, 0, 1, 1, {}, true, undefined);
  });

  it('starts nothing while the stock defaults cannot be loaded', async () => {
    vi.mocked(lightingApi.fetchAnimateDefaults).mockResolvedValue(null);
    const { container } = renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    fireEvent.click(container.querySelector('[data-effect-key="sharplines"]') as HTMLButtonElement);
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchAnimateDefaults)).toHaveBeenCalled();
    });
    expect(vi.mocked(lightingApi.startAnimate)).not.toHaveBeenCalled();
    expect(vi.mocked(lightingApi.saveAnimateTemplates)).not.toHaveBeenCalled();
  });

  it('reads a missing running state as forward, whatever was stored locally', async () => {
    localStorage.setItem('nexus.lighting.simpleReversed', 'true');
    syncState.mode = 'animate';
    syncState.rawSync = 'rainbow';
    renderPage();
    const toggle = screen.getByRole('switch', { name: 'lighting.simple.reverse' });
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
  });

  it('marks no tile when the effect runs on another preset', async () => {
    vi.mocked(lightingApi.fetchAnimateSettings).mockResolvedValue({
      effect: 'rainbow', states: {}, templates: { rainbow: { selected: 2, slots: [] } },
    } as never);
    syncState.mode = 'animate';
    syncState.rawSync = 'rainbow';
    const { container } = renderPage();
    expect(await screen.findByText('lighting.simple.customActive')).toBeTruthy();
    const tile = container.querySelector('[data-effect-key="rainbow"]') as HTMLButtonElement;
    expect(tile.className).not.toContain('cardActive');
  });

  it('marks the running animation and does not call it a custom setup', async () => {
    syncState.mode = 'animate';
    syncState.rawSync = 'sweepcycle';
    const { container } = renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    const tile = container.querySelector('[data-effect-key="sweepcycle"]') as HTMLButtonElement;
    expect(tile.className).toContain('cardActive');
    expect(screen.queryByText('lighting.simple.customActive')).toBeNull();
  });

  it('marks the replacement tile for a retired simple-mode key', async () => {
    syncState.mode = 'animate';
    syncState.rawSync = 'sweepbars';
    const { container } = renderPage();
    await waitFor(() => {
      expect(vi.mocked(lightingApi.fetchLightingDevices)).toHaveBeenCalled();
    });
    const tile = container.querySelector('[data-effect-key="sharplines"]') as HTMLButtonElement;
    expect(tile.className).toContain('cardActive');
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

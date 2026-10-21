import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLightingDevices, fetchPins, fetchStaticSettings, saveAnimateTemplates, setPins, startAnimate, startStatic, type Pin } from '../../../api/lighting';
import { UiSettingsProvider } from '../../../hooks/useUiSettings';
import { ANIMATE_EFFECTS } from '../../../types/lighting';
import { LightingPage } from './LightingPage';
import { colorPin } from './pins';
import styles from './LightingPage.module.scss';

const topicHandlers = vi.hoisted(() => ({ lighting: [] as (() => void)[] }));
const syncState = vi.hoisted(() => ({ mode: 'animate', rawSync: 'fire' }));

vi.mock('../../../hooks/useLightingSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useLightingSync')>()),
  useLightingSync: () => ({
    mode: syncState.mode,
    setMode: vi.fn(),
    rawSync: syncState.rawSync,
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
  useLightingFrames: () => ({ connected: false, live: false }),
}));
vi.mock('../../../hooks/useUsbDevices', () => ({ useUsbDevices: () => ({ devices: [] }) }));
vi.mock('../../../hooks/useAudioState', () => ({ useAudioState: () => ({ current: null }) }));
vi.mock('../../../lib/controlSync', () => ({
  publishControlSync: vi.fn(),
  subscribeControlSync: vi.fn(() => () => {}),
}));

// The selection the page hands the grid is the thing under test, so the stub
// renders it instead of the real cells.
vi.mock('./page/AnimateGrid', () => ({
  AnimateGrid: ({ effect, onSelect, pinnedDevices }: {
    effect: string;
    onSelect?: (key: string) => void;
    pinnedDevices?: ReadonlyMap<string, readonly string[]>;
  }) => (
    <div>
      <div data-testid="grid-effect" onClick={() => onSelect?.('stripes')}>{effect}</div>
      <div data-testid="grid-pins">{[...(pinnedDevices ?? [])].map(([k, v]) => `${k}=${v.join('+')}`).join(';')}</div>
    </div>
  ),
}));
vi.mock('./page/FullscreenShader', () => ({
  FullscreenShader: ({ effect, onPrev }: { effect: string; onPrev: () => void }) => (
    <div data-testid="fullscreen" data-effect={effect}>
      <button type="button" onClick={onPrev}>fs-prev</button>
    </div>
  ),
}));
vi.mock('./page/ModeControls', () => ({
  ModeControls: ({ mode, onSelectionPick, keepMode, onBlockedPick }: { mode: string; onSelectionPick?: () => void; keepMode?: boolean; onBlockedPick?: () => void }) => (
    <div data-testid="mode-controls" data-mode={mode} data-keep-mode={String(!!keepMode)} data-blocked={String(!!onBlockedPick)}>
      {onSelectionPick && <button type="button" onClick={onSelectionPick}>selection-pick</button>}
    </div>
  ),
}));
vi.mock('./page/StaticPickerCanvas', () => ({
  StaticPickerCanvas: ({ onCommit, onPreview, hex, devices, implied, patternEffect }: {
    onCommit: (hex: string) => void;
    onPreview: (hex: string) => void;
    hex: string;
    devices: { id: string; hex: string; pinned?: boolean }[];
    implied?: boolean;
    patternEffect?: string | null;
  }) => (
    <div data-pick data-testid="picker-field">
      <span data-testid="picker-hex">{hex}</span>
      <span data-testid="picker-pattern">{patternEffect ?? ''}</span>
      <span data-testid="picker-marks" data-implied={implied ? '1' : ''}>{devices.map(d => `${d.id}@${d.hex}${d.pinned ? '(pinned)' : ''}`).join(';')}</span>
      <button type="button" onClick={() => onCommit('#00ff00')}>pick-green</button>
      <button type="button" onClick={() => onPreview('#0000ff')}>preview-blue</button>
    </div>
  ),
}));
// The stub exposes what the pins ride on: the pins the rail is handed, the
// source a press pins to, the disabled reason, and the callbacks.
vi.mock('./page/DevicePanel', () => ({
  DevicePanel: ({ pins, pinSource, pinDisabledReason, pinTargetName, onSetPin, onSetSelection, pickTargetIds, pulse }: {
    pins?: Record<string, Pin>;
    pinSource?: string | null;
    pinDisabledReason?: string;
    pinTargetName?: (pin: Pin) => string;
    onSetPin?: (ids: string[], pinned: boolean) => void;
    onSetSelection: (ids: Set<string>, primary: string | null) => void;
    pickTargetIds?: ReadonlySet<string>;
    pulse?: { ids: ReadonlySet<string>; seq: number };
  }) => (
    <div
      data-testid="rail"
      data-targets={pickTargetIds ? [...pickTargetIds].join(',') : 'none'}
      data-pulse={pulse ? `${[...pulse.ids].join(',')}#${pulse.seq}` : ''}
      data-pin={pins?.a ? JSON.stringify(pins.a) : ''}
      data-pin-name={pins?.a && pinTargetName ? pinTargetName(pins.a) : ''}
      data-source={pinSource ?? ''}
      data-disabled={pinDisabledReason ?? ''}
    >
      <button type="button" onClick={() => onSetPin?.(['a'], !pins?.a)}>toggle</button>
      <button type="button" onClick={() => onSetSelection(new Set(['a']), 'a')}>select-a</button>
      <button type="button" onClick={() => onSetSelection(new Set(['a', 'b']), 'a')}>select-ab</button>
      <button type="button" onClick={() => onSetSelection(new Set(['b', 'a']), 'b')}>select-ba</button>
      <button type="button" onClick={() => onSetSelection(new Set(), null)}>clear-selection</button>
    </div>
  ),
}));
vi.mock('./page/LedMapEditor', () => ({ LedMapEditor: () => null }));
vi.mock('./page/MediaBackdrop', () => ({ MediaBackdrop: () => <div data-testid="media-backdrop" /> }));
vi.mock('./page/MirrorBackdrop', () => ({ MirrorBackdrop: () => <div data-testid="mirror-backdrop" /> }));
vi.mock('./page/RightPaneTabs', () => ({ RightPaneTabs: () => null }));
// A typed slider edit is onChange(v, true) followed synchronously by onCommit.
vi.mock('./page/EffectTab', () => ({
  EffectTab: ({ mode, effect, state, onAnimateChange, onAnimateCommit }: {
    mode: string;
    effect: string;
    state: { intensity: number } | null;
    onAnimateChange: (patch: { intensity: number }, commit?: boolean) => void;
    onAnimateCommit: () => void;
  }) => (
    <button
      type="button"
      data-testid="type-intensity"
      data-mode={mode}
      data-effect={effect}
      data-intensity={state?.intensity}
      onClick={() => { onAnimateChange({ intensity: 0.3 }, true); onAnimateCommit(); }}
    >type</button>
  ),
}));
vi.mock('../../../components/common/ViewHeader/ViewHeader', () => ({
  ViewHeader: ({ tabs, activeTab, onTabChange, onTabHover }: {
    tabs?: { key: string }[];
    activeTab?: string;
    onTabChange?: (key: string) => void;
    onTabHover?: (key: string | null) => void;
  }) => (
    <div data-testid="tabs" data-active={activeTab ?? ''}>
      {tabs?.map(tab => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange?.(tab.key)}
          onMouseEnter={() => onTabHover?.(tab.key)}
          onMouseLeave={() => onTabHover?.(null)}
        >{`tab:${tab.key}`}</button>
      ))}
    </div>
  ),
}));
vi.mock('../../../components/views/ServiceRequired', () => ({ ServiceRequired: () => null }));
vi.mock('../../../components/common/DeviceCanvas/DeviceCanvas', () => ({
  DeviceCanvas: ({ shaderEffect, backdrop, foreignFrames }: { shaderEffect?: string | null; backdrop?: React.ReactNode; foreignFrames?: ReadonlyMap<string, string> }) => (
    <div data-testid="preview" data-effect={shaderEffect ?? ''} data-foreign={[...(foreignFrames ?? [])].map(([id, mode]) => `${id}:${mode}`).sort().join(',')}>{backdrop}</div>
  ),
}));

vi.mock('../../../api/lighting', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../api/lighting')>();
  return {
    ...actual,
    fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: syncState.rawSync })),
    fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'fire', states: {}, templates: {} })),
    fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'checker', states: {} })),
    fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
    cachedAnimateDefaults: vi.fn(() => null),
    fetchMusicReactive: vi.fn(() => Promise.resolve({ enabled: false })),
    fetchScreenEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchMediaEffect: vi.fn(() => Promise.resolve({ hue: 0, colorize: 0, saturation: 1, contrast: 1 })),
    fetchLightingDevices: vi.fn(() => Promise.resolve({ isInit: true, devices: [{ id: 'a', name: 'Fan A', ledsOn: true, ledCount: 10, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0 }] })),
    fetchLedMap: vi.fn(() => Promise.resolve(null)),
    fetchAvailableMappings: vi.fn(() => Promise.resolve(null)),
    fetchLayoutPresets: vi.fn(() => Promise.resolve(null)),
    saveAnimateTemplates: vi.fn(() => Promise.resolve(null)),
    startAnimate: vi.fn(() => Promise.resolve(null)),
    startStatic: vi.fn(() => Promise.resolve(null)),
    startScreenMirror: vi.fn(() => Promise.resolve(null)),
    stopLighting: vi.fn(() => Promise.resolve(null)),
    setMusicReactive: vi.fn(() => Promise.resolve(null)),
    setPins: vi.fn(() => Promise.resolve(true)),
    fetchPins: vi.fn(() => Promise.resolve({})),
  };
});

const serviceState = { cooling: null, lighting: null, panel: null } as never;

const renderPage = (platform = '') => render(
  <UiSettingsProvider>
    <LightingPage serviceOnline serviceState={serviceState} activeProfileId="p1" platform={platform} />
  </UiSettingsProvider>,
);

// The rail stub shows device a's pin once the pins have loaded.
const pinsLoaded = () => waitFor(() => expect(screen.getByTestId('rail').dataset.pin).not.toBe(''));

const device = (id: string, name: string) => ({ id, name, ledsOn: true, ledCount: 10, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0 });
const withDevices = (...ids: string[]) => vi.mocked(fetchLightingDevices).mockImplementation(
  () => Promise.resolve({ isInit: true, devices: ids.map(id => device(id, `Fan ${id.toUpperCase()}`)) }) as never,
);

const pinOf = () => {
  const raw = screen.getByTestId('rail').dataset.pin;
  return raw ? JSON.parse(raw) as Pin : null;
};
const lastPinsCall = () => vi.mocked(setPins).mock.calls.at(-1) as unknown as [string[], Pin | null];

describe('LightingPage pins', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('nexus_settings', JSON.stringify({ general: { lightingDashboardMode: 'advanced', coolingDashboardMode: 'advanced' } }));
    syncState.mode = 'animate';
    syncState.rawSync = 'fire';
    vi.mocked(setPins).mockClear();
    vi.mocked(setPins).mockImplementation(() => Promise.resolve(true));
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({}));
    vi.mocked(fetchStaticSettings).mockImplementation(() => Promise.resolve({ effect: 'checker', states: {} }));
    withDevices('a');
    vi.mocked(startAnimate).mockClear();
    vi.mocked(startStatic).mockClear();
    vi.mocked(saveAnimateTemplates).mockClear();
    topicHandlers.lighting.length = 0;
  });

  describe('the pin button', () => {
    it('pins a following card to the running shader in Animate, optimistically, and a second press unpins', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail').dataset.source).not.toBe(''));
      expect(screen.getByTestId('rail').dataset.disabled).toBe('');

      fireEvent.click(screen.getByText('toggle'));
      expect(pinOf()).toEqual({ kind: 'animate', effect: 'fire' });
      expect(setPins).toHaveBeenCalledWith(['a'], { kind: 'animate', effect: 'fire' });

      fireEvent.click(screen.getByText('toggle'));
      expect(pinOf()).toBeNull();
      expect(lastPinsCall()).toEqual([['a'], null]);
    });

    it('pins to the global static look in Static', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail').dataset.source).not.toBe(''));
      fireEvent.click(screen.getByText('toggle'));
      expect(lastPinsCall()[0]).toEqual(['a']);
      expect(lastPinsCall()[1]).toMatchObject({ kind: 'static', effect: 'checker' });
    });

    it('pins to the global flat color in Static when one is set, not the pattern', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      vi.mocked(fetchStaticSettings).mockResolvedValue({ effect: 'checker', states: {}, color: '#336699' });
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail').dataset.source).toBe('lighting.palette.azure 4'));
      fireEvent.click(screen.getByText('toggle'));
      expect(lastPinsCall()).toEqual([['a'], colorPin('#336699')]);
    });

    it('pins to the one universal Mirror in Mirror', async () => {
      syncState.mode = 'screen';
      syncState.rawSync = 'screen';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail').dataset.source).not.toBe(''));
      fireEvent.click(screen.getByText('toggle'));
      expect(lastPinsCall()).toEqual([['a'], { kind: 'mirror' }]);
    });

    it('keeps the pin enabled for a Simple-mode sweep and pins it as an animate shader', async () => {
      syncState.rawSync = 'sweeprainbow';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail').dataset.source).not.toBe(''));
      expect(screen.getByTestId('rail').dataset.disabled).toBe('');
      fireEvent.click(screen.getByText('toggle'));
      expect(lastPinsCall()).toEqual([['a'], { kind: 'animate', effect: 'sweeprainbow' }]);
    });

    it('pins to the one shared Media in Media', async () => {
      syncState.mode = 'gif';
      syncState.rawSync = 'gif';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail').dataset.source).not.toBe(''));
      fireEvent.click(screen.getByText('toggle'));
      expect(lastPinsCall()).toEqual([['a'], { kind: 'media' }]);
    });

    it.each([
      ['none', 'lighting.pin.disabledOff'],
    ])('is disabled in %s, naming why', async (mode, reason) => {
      syncState.mode = mode;
      syncState.rawSync = mode;
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail').dataset.disabled).toBe(reason));
      expect(screen.getByTestId('rail').dataset.source).toBe('');
    });

    it('names a pin by its target', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail').dataset.pinName).toBe('lighting.mode.screen'));
    });

    it('puts the pin back when the service refuses', async () => {
      vi.mocked(setPins).mockImplementation(() => Promise.resolve(false));
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail').dataset.source).not.toBe(''));
      fireEvent.click(screen.getByText('toggle'));
      expect(pinOf()).not.toBeNull();
      await waitFor(() => expect(pinOf()).toBeNull());
    });
  });

  describe('what a pick with nothing selected reaches', () => {
    it('says how many devices a pick changes', async () => {
      withDevices('a', 'b');
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await pinsLoaded();
      expect(screen.getByText('lighting.pane.appliesDevices.one')).toBeTruthy();
      fireEvent.click(screen.getByText('select-ab'));
      expect(screen.getByText('lighting.pane.appliesSelected.other')).toBeTruthy();
    });

    it('previews its reach on a hover of the scope chip', async () => {
      withDevices('a', 'b', 'c');
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await pinsLoaded();
      const chip = screen.getByText('lighting.pane.appliesDevices.other').closest(`.${styles.scopeChip}`)!;
      const targets = () => screen.getByTestId('rail').dataset.targets;
      fireEvent.pointerEnter(chip, { pointerType: 'mouse' });
      expect(targets()).toBe('b,c');
      fireEvent.pointerLeave(chip, { pointerType: 'mouse' });
      expect(targets()).toBe('none');
    });

    it('previews its reach on a hover of a pick control, like a tab', async () => {
      withDevices('a', 'b', 'c');
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      const field = await screen.findByTestId('picker-field');
      await pinsLoaded();
      const targets = () => screen.getByTestId('rail').dataset.targets;
      fireEvent.pointerOver(screen.getByTestId('picker-hex'), { pointerType: 'mouse' });
      expect(targets()).toBe('b,c');
      fireEvent.pointerOver(field.parentElement!, { pointerType: 'mouse' });
      expect(targets()).toBe('none');
    });

    it('asks for a selection when every device wears a pin', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await pinsLoaded();
      expect(screen.getByText('lighting.pane.selectToChange')).toBeTruthy();
    });

    it('marks every device dotted with nothing selected and a selection solid on what each wears, flagging the pinned', async () => {
      withDevices('a', 'b');
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      vi.mocked(fetchStaticSettings).mockResolvedValue({ effect: 'checker', states: {}, color: '#336699' });
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: colorPin('#ff0000') }));
      renderPage();
      const marks = () => screen.getByTestId('picker-marks');
      await waitFor(() => expect(marks().textContent).toBe('a@#ff0000(pinned);b@#336699'));
      expect(marks().dataset.implied).toBe('1');
      fireEvent.click(screen.getByText('select-ab'));
      await waitFor(() => expect(marks().textContent).toBe('a@#ff0000(pinned);b@#336699'));
      expect(marks().dataset.implied).toBe('');
    });
  });

  describe('hovering a mode tab', () => {
    const targets = () => screen.getByTestId('rail').dataset.targets;
    const tab = (key: string) => screen.getByText(`tab:${key}`);

    it('previews the unpinned cards with nothing selected, and the selection once there is one', async () => {
      withDevices('a', 'b', 'c');
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail')).toBeTruthy());
      expect(targets()).toBe('none');
      fireEvent.mouseEnter(tab('gif'));
      await waitFor(() => expect(targets()).toBe('b,c'));
      fireEvent.click(screen.getByText('select-a'));
      expect(targets()).toBe('a');
      fireEvent.mouseLeave(tab('gif'));
      expect(targets()).toBe('none');
    });

    it('previews nothing on the tab already showing when its press changes nothing', async () => {
      withDevices('a', 'b');
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('animate'));
      fireEvent.mouseEnter(tab('animate'));
      expect(targets()).toBe('none');
      fireEvent.mouseLeave(tab('animate'));
      // Selecting the Mirror card keeps Animation open, and its press would pin the card.
      fireEvent.click(screen.getByText('select-a'));
      expect(screen.getByTestId('tabs').dataset.active).toBe('animate');
      fireEvent.mouseEnter(tab('animate'));
      expect(targets()).toBe('a');
      fireEvent.mouseLeave(tab('animate'));
      // On the Mirror tab the card already wears Mirror, so its press changes nothing.
      fireEvent.click(screen.getByText('tab:screen'));
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('screen'));
      fireEvent.mouseEnter(tab('screen'));
      expect(targets()).toBe('none');
    });

    it('previews an unpinned selection on the tab already showing, since its press pins it', async () => {
      withDevices('a', 'b');
      renderPage();
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('animate'));
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.mouseEnter(tab('animate'));
      expect(targets()).toBe('a');
      fireEvent.click(screen.getByText('tab:animate'));
      expect(lastPinsCall()[0]).toEqual(['a']);
      expect(lastPinsCall()[1]).toMatchObject({ kind: 'animate' });
    });

    it('outlines and pins only the selected cards not already pinned to the pressed mode', async () => {
      withDevices('a', 'b');
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.kind).toBe('mirror'));
      fireEvent.click(screen.getByText('select-ab'));
      fireEvent.mouseEnter(tab('screen'));
      expect(targets()).toBe('b');
      fireEvent.click(screen.getByText('tab:screen'));
      expect(lastPinsCall()).toEqual([['b'], { kind: 'mirror' }]);
    });

    it('clears on a press, which may remount the tab before its pointerleave', async () => {
      withDevices('a', 'b');
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail')).toBeTruthy());
      fireEvent.mouseEnter(tab('static'));
      expect(targets()).toBe('a,b');
      fireEvent.click(tab('static'));
      expect(targets()).toBe('none');
    });

    it('sweeps a pulse across the cards a press changes, and none for a press that changes nothing', async () => {
      withDevices('a', 'b', 'c');
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('animate'));
      await pinsLoaded();
      const pulse = () => screen.getByTestId('rail').dataset.pulse;
      fireEvent.click(tab('animate'));
      expect(pulse()).toBe('#0');
      fireEvent.click(tab('static'));
      expect(pulse()).toBe('b,c#1');
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(tab('gif'));
      expect(pulse()).toBe('a#2');
    });

    it('pulses the cards a pick changes, selected ones included', async () => {
      withDevices('a', 'b', 'c');
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await pinsLoaded();
      const pulse = () => screen.getByTestId('rail').dataset.pulse;
      fireEvent.click(screen.getByTestId('grid-effect'));
      expect(pulse()).toBe('b,c#1');
      fireEvent.click(screen.getByText('select-ab'));
      fireEvent.click(screen.getByTestId('grid-effect'));
      expect(pulse()).toBe('a,b#2');
    });

    it('pulses no card for a re-pick of the tile already worn', async () => {
      withDevices('a', 'b');
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      vi.mocked(fetchStaticSettings).mockResolvedValue({ effect: 'stripes', states: {} });
      renderPage();
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('stripes'));
      fireEvent.click(screen.getByTestId('grid-effect'));
      expect(screen.getByTestId('rail').dataset.pulse).toBe('#0');
    });

    it('pulses every card a Mirror pick reaches through the shared capture', async () => {
      withDevices('a', 'b', 'c');
      syncState.mode = 'animate';
      syncState.rawSync = 'fire';
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' }, b: { kind: 'mirror' } }));
      renderPage();
      await pinsLoaded();
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(screen.getByText('tab:screen'));
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('screen'));
      fireEvent.click(await screen.findByText('selection-pick'));
      expect(screen.getByTestId('rail').dataset.pulse).toMatch(/^a,b#\d+$/);
    });

    it('outlines nothing on the mode menu', async () => {
      withDevices('a', 'b');
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail')).toBeTruthy());
      fireEvent.mouseEnter(tab('modeMenu'));
      expect(targets()).toBe('none');
    });
  });

  describe('syncing with the service', () => {
    it('reads the pins on mount and again on the lighting broadcast', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));

      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({}));
      topicHandlers.lighting.forEach(cb => cb());
      await waitFor(() => expect(pinOf()).toBeNull());
    });

    it('keeps what it has when the pins are unreadable', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));
      vi.mocked(fetchPins).mockClear();
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve(null));
      topicHandlers.lighting.forEach(cb => cb());
      await waitFor(() => expect(fetchPins).toHaveBeenCalled());
      expect(pinOf()?.effect).toBe('aurora');
    });

    it('keeps a pin request in flight against a lighting frame that predates it', async () => {
      let resolve: (ok: boolean) => void = () => {};
      vi.mocked(setPins).mockImplementation(() => new Promise<boolean>(r => { resolve = r; }));
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail').dataset.source).not.toBe(''));
      fireEvent.click(screen.getByText('toggle'));
      expect(pinOf()?.effect).toBe('fire');

      vi.mocked(fetchPins).mockClear();
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({}));
      topicHandlers.lighting.forEach(cb => cb());
      await waitFor(() => expect(fetchPins).toHaveBeenCalled());
      await new Promise(r => setTimeout(r, 0));
      expect(pinOf()?.effect).toBe('fire');

      resolve(true);
      await new Promise(r => setTimeout(r, 0));
      expect(pinOf()?.effect).toBe('fire');
    });
  });

  describe('picks', () => {
    it('on a tab other than the running mode with nothing selected, a pick changes nothing and flashes the scope chip', async () => {
      localStorage.setItem('nexus.lighting.effectDockCollapsed', 'false');
      syncState.mode = 'animate';
      syncState.rawSync = 'fire';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('animate'));
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(screen.getByText('tab:static'));
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('static'));
      fireEvent.click(screen.getByText('clear-selection'));
      expect(screen.getByTestId('tabs').dataset.active).toBe('static');
      vi.mocked(startStatic).mockClear();
      vi.mocked(startAnimate).mockClear();
      vi.mocked(setPins).mockClear();
      const chip = screen.getByText('lighting.pane.selectToChange').closest(`.${styles.scopeChip}`)!;
      expect(chip.classList.contains(styles.scopeFlash)).toBe(false);
      fireEvent.click(screen.getByTestId('grid-effect'));
      fireEvent.click(screen.getByText('pick-green'));
      await waitFor(() => expect(screen.getByText('lighting.pane.selectToChange').closest(`.${styles.scopeChip}`)!.classList.contains(styles.scopeFlash)).toBe(true));
      expect(startStatic).not.toHaveBeenCalled();
      expect(startAnimate).not.toHaveBeenCalled();
      expect(setPins).not.toHaveBeenCalled();
      expect(screen.getByTestId('tabs').dataset.active).toBe('static');
      // The dock would edit the running animation, so it is locked as for a mixed selection.
      expect(document.querySelector(`.${styles.effectTabBody}`)?.hasAttribute('inert')).toBe(true);
    });

    it('keeps the running mode on a detached Media tab and blocks its picks', async () => {
      syncState.mode = 'animate';
      syncState.rawSync = 'fire';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('animate'));
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(screen.getByText('tab:gif'));
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('gif'));
      expect(screen.getByTestId('mode-controls').dataset.blocked).toBe('false');
      fireEvent.click(screen.getByText('clear-selection'));
      const controls = screen.getByTestId('mode-controls');
      expect(controls.dataset.keepMode).toBe('true');
      expect(controls.dataset.blocked).toBe('true');
    });

    it('with nothing selected a Static pick is global, never a pin, and needs no selection', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('checker'));
      vi.mocked(startStatic).mockClear();
      fireEvent.click(screen.getByTestId('grid-effect'));
      await waitFor(() => expect(startStatic).toHaveBeenCalled());
      expect(vi.mocked(startStatic).mock.calls.at(-1)?.[0]).toBe('stripes');
      expect(setPins).not.toHaveBeenCalled();
    });

    it('with nothing selected a picked color is the exact global color', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('checker'));
      vi.mocked(startStatic).mockClear();
      fireEvent.click(screen.getByText('pick-green'));
      await waitFor(() => expect(startStatic).toHaveBeenCalled());
      expect(vi.mocked(startStatic).mock.calls.at(-1)?.[8]).toBe('#00ff00');
      expect(setPins).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByTestId('picker-hex').textContent).toBe('#00ff00'));
    });

    it('shows the service\'s global flat color as the selected look, with no effect tile lit', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      vi.mocked(fetchStaticSettings).mockResolvedValue({ effect: 'checker', states: {}, color: '#336699' });
      renderPage();
      await waitFor(() => expect(screen.getByTestId('picker-hex').textContent).toBe('#336699'));
      expect(screen.getByTestId('grid-effect').textContent).toBe('');
    });

    it('picking an effect after a global color leaves the color out of the start', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      vi.mocked(fetchStaticSettings).mockResolvedValue({ effect: 'checker', states: {}, color: '#336699' });
      renderPage();
      await waitFor(() => expect(screen.getByTestId('picker-hex').textContent).toBe('#336699'));
      vi.mocked(startStatic).mockClear();
      fireEvent.click(screen.getByTestId('grid-effect'));
      await waitFor(() => expect(startStatic).toHaveBeenCalled());
      expect(vi.mocked(startStatic).mock.calls.at(-1)?.[8]).toBeUndefined();
      await waitFor(() => expect(screen.getByTestId('picker-hex').textContent).toBe(''));
    });

    it('with nothing selected the preview shows the global pattern, and follows a pattern pick after a color', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('picker-pattern').textContent).toBe('checker'));
      fireEvent.click(screen.getByText('pick-green'));
      await waitFor(() => expect(screen.getByTestId('picker-pattern').textContent).toBe(''));
      fireEvent.click(screen.getByTestId('grid-effect'));
      await waitFor(() => expect(screen.getByTestId('picker-pattern').textContent).toBe('stripes'));
    });

    it('follows a pattern another client picked', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('picker-pattern').textContent).toBe('checker'));
      vi.mocked(fetchStaticSettings).mockResolvedValue({ effect: 'stripes', states: {} });
      for (const h of topicHandlers.lighting) h();
      await waitFor(() => expect(screen.getByTestId('picker-pattern').textContent).toBe('stripes'));
    });

    it('with nothing selected an Animate pick is global', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('fire'));
      vi.mocked(startAnimate).mockClear();
      fireEvent.click(screen.getByTestId('grid-effect'));
      await waitFor(() => expect(vi.mocked(startAnimate).mock.calls.some(c => c[0] === 'stripes')).toBe(true));
      expect(setPins).not.toHaveBeenCalled();
    });

    it('with devices selected an Animate pick pins them and leaves the running effect alone', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('fire'));
      fireEvent.click(screen.getByText('select-a'));
      vi.mocked(startAnimate).mockClear();
      fireEvent.click(screen.getByTestId('grid-effect'));
      expect(lastPinsCall()).toEqual([['a'], { kind: 'animate', effect: 'stripes' }]);
      expect(startAnimate).not.toHaveBeenCalled();
    });

    it('with devices selected a Static pick pins the whole look', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('checker'));
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(screen.getByTestId('grid-effect'));
      expect(lastPinsCall()[0]).toEqual(['a']);
      expect(lastPinsCall()[1]).toMatchObject({ kind: 'static', effect: 'stripes', slot: 0 });
      expect(lastPinsCall()[1]?.params).toBeDefined();
    });

    it('with devices selected a picked color pins them to it', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('checker'));
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(screen.getByText('pick-green'));
      await waitFor(() => expect(setPins).toHaveBeenCalled());
      expect(lastPinsCall()[0]).toEqual(['a']);
      expect(lastPinsCall()[1]).toMatchObject({ kind: 'static', effect: 'flat', color: '#00ff00' });
    });

    it('re-pins a selected pinned device instead of blocking', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(screen.getByTestId('grid-effect'));
      expect(lastPinsCall()).toEqual([['a'], { kind: 'animate', effect: 'stripes' }]);
      await waitFor(() => expect(pinOf()?.effect).toBe('stripes'));
    });

    it('never touches unselected pinned devices', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ b: { kind: 'animate', effect: 'aurora' } }));
      renderPage();
      await waitFor(() => expect(fetchPins).toHaveBeenCalled());
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(screen.getByTestId('grid-effect'));
      expect(lastPinsCall()[0]).toEqual(['a']);
    });
  });

  it('starts with no selection, so the grid and preview show the running effect', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('fire'));
    expect(screen.getByTestId('preview').dataset.effect).toBe('fire');
  });

  describe('a selection wearing one pin', () => {
    it('scopes the grid, preview and fullscreen to a pinned shader, and clearing leaves the scope', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));
      expect(screen.getByTestId('grid-effect').textContent).toBe('fire');

      vi.mocked(startAnimate).mockClear();
      fireEvent.click(screen.getByText('select-a'));
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('aurora'));
      expect(screen.getByTestId('preview').dataset.effect).toBe('aurora');
      expect(startAnimate).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'lighting.fullscreen' }));
      expect(screen.getByTestId('fullscreen').dataset.effect).toBe('aurora');

      fireEvent.click(screen.getByText('clear-selection'));
      await waitFor(() => expect(screen.getByTestId('preview').dataset.effect).toBe('fire'));
      expect(screen.getByTestId('grid-effect').textContent).toBe('fire');
    });

    it('edits a pinned shader\'s global settings without restarting the running effect', async () => {
      localStorage.setItem('nexus.lighting.effectDockCollapsed', 'false');
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));
      fireEvent.click(screen.getByText('select-a'));
      await waitFor(() => expect(screen.getByTestId('type-intensity').dataset.effect).toBe('aurora'));
      await waitFor(() => expect(startAnimate).toHaveBeenCalled());
      vi.mocked(startAnimate).mockClear();
      vi.mocked(saveAnimateTemplates).mockClear();

      fireEvent.click(screen.getByTestId('type-intensity'));
      await waitFor(() => expect(saveAnimateTemplates).toHaveBeenCalled());
      const saved = vi.mocked(saveAnimateTemplates).mock.calls.at(-1)?.[0] as Record<string, { selected: number; slots: { intensity: number }[] }>;
      expect(saved.aurora.slots[saved.aurora.selected].intensity).toBe(0.3);
      expect(startAnimate).not.toHaveBeenCalled();
      expect(setPins).not.toHaveBeenCalled();
    });

    it('edits only the focused look when the selected cards wear different static looks', async () => {
      localStorage.setItem('nexus.lighting.effectDockCollapsed', 'false');
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      withDevices('a', 'b');
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({
        a: { kind: 'static', effect: 'stripes', slot: 0, intensity: 1 },
        b: { kind: 'static', effect: 'checker', slot: 0, intensity: 1 },
      }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('stripes'));
      fireEvent.click(screen.getByText('select-ab'));
      await waitFor(() => expect(screen.getByTestId('type-intensity').dataset.effect).toBe('stripes'));
      fireEvent.click(screen.getByTestId('type-intensity'));
      await waitFor(() => expect(setPins).toHaveBeenCalled());
      expect(lastPinsCall()[0]).toEqual(['a']);
      expect(lastPinsCall()[1]).toMatchObject({ kind: 'static', effect: 'stripes' });
    });

    it('edits a static pin by re-pinning its devices with the new look', async () => {
      localStorage.setItem('nexus.lighting.effectDockCollapsed', 'false');
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'static', effect: 'stripes', slot: 0, intensity: 1 } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('stripes'));
      fireEvent.click(screen.getByText('select-a'));
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('stripes'));
      await waitFor(() => expect(screen.getByTestId('type-intensity').dataset.effect).toBe('stripes'));
      vi.mocked(startStatic).mockClear();

      fireEvent.click(screen.getByTestId('type-intensity'));
      await waitFor(() => expect(setPins).toHaveBeenCalled());
      expect(lastPinsCall()[0]).toEqual(['a']);
      expect(lastPinsCall()[1]).toMatchObject({ kind: 'static', effect: 'stripes', intensity: 0.3 });
      expect(startStatic).not.toHaveBeenCalled();
    });

    it.each(['animate', 'static', 'gif'])('keeps %s open when a mirror-pinned card is selected, showing no effect', async mode => {
      syncState.mode = mode;
      syncState.rawSync = mode === 'animate' ? 'fire' : mode;
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.kind).toBe('mirror'));
      fireEvent.click(screen.getByText('select-a'));
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe(mode));
      if (mode !== 'gif') expect(screen.getByTestId('grid-effect').textContent).toBe('');
    });

    it('keeps the full Mirror controls on the Mirror tab itself', async () => {
      syncState.mode = 'screen';
      syncState.rawSync = 'screen';
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'mirror' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.kind).toBe('mirror'));
      fireEvent.click(screen.getByText('select-a'));
      expect(screen.getByTestId('mode-controls').dataset.mode).toBe('screen');
    });

    it('keeps Media open for a shader-pinned card until the Animation tab is pressed, which shows its pin', async () => {
      syncState.mode = 'gif';
      syncState.rawSync = 'gif';
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));
      fireEvent.click(screen.getByText('select-a'));
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('gif'));
      const writes = vi.mocked(setPins).mock.calls.length;
      fireEvent.click(screen.getByText('tab:animate'));
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('animate'));
      expect(screen.getByTestId('grid-effect').textContent).toBe('aurora');
      // The card already wears an Animation pin, so the press keeps it.
      expect(vi.mocked(setPins).mock.calls.length).toBe(writes);
      // Selecting and deselecting cards never moves the open tab.
      fireEvent.click(screen.getByText('clear-selection'));
      expect(screen.getByTestId('tabs').dataset.active).toBe('animate');
      fireEvent.click(screen.getByText('select-a'));
      expect(screen.getByTestId('tabs').dataset.active).toBe('animate');
    });

    it('previews no effect while a selected card is pinned to another mode', async () => {
      syncState.mode = 'animate';
      syncState.rawSync = 'fire';
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'static', effect: 'stripes', slot: 0, intensity: 1 } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('stripes'));
      await waitFor(() => expect(screen.getByTestId('preview').dataset.effect).toBe('fire'));
      fireEvent.click(screen.getByText('select-a'));
      await waitFor(() => expect(screen.getByTestId('preview').dataset.effect).toBe(''));
      expect(screen.getByTestId('tabs').dataset.active).toBe('animate');
      // Its frame is marked as not part of this canvas, captioned with the mode it wears.
      expect(screen.getByTestId('preview').dataset.foreign).toBe('a:lighting.mode.static');
    });

    it('focuses the first-selected card when the selected cards wear different animations', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({
        a: { kind: 'animate', effect: 'aurora' },
        b: { kind: 'animate', effect: 'plasma' },
      }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));
      fireEvent.click(screen.getByText('select-ab'));
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('aurora'));
      expect(screen.getByRole('button', { name: 'lighting.fullscreen' })).toBeTruthy();
      fireEvent.click(screen.getByText('select-ba'));
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('plasma'));
    });

    it('a fullscreen arrow steps from the pinned target on screen and re-pins the selection', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));
      fireEvent.click(screen.getByText('select-a'));
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('aurora'));
      fireEvent.click(screen.getByRole('button', { name: 'lighting.fullscreen' }));
      const at = ANIMATE_EFFECTS.findIndex(e => e.key === 'aurora');
      fireEvent.click(screen.getByText('fs-prev'));
      expect(lastPinsCall()).toEqual([['a'], { kind: 'animate', effect: ANIMATE_EFFECTS[at - 1].key }]);
      // The pin moved, so the screen moves with it and the next press steps on from there.
      await waitFor(() => expect(screen.getByTestId('fullscreen').dataset.effect).toBe(ANIMATE_EFFECTS[at - 1].key));
      fireEvent.click(screen.getByText('fs-prev'));
      expect(lastPinsCall()[1]).toEqual({ kind: 'animate', effect: ANIMATE_EFFECTS[at - 2].key });
    });

    it('a fullscreen arrow with nothing selected steps the global effect, as before', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('grid-effect').textContent).toBe('fire'));
      fireEvent.click(screen.getByRole('button', { name: 'lighting.fullscreen' }));
      const at = ANIMATE_EFFECTS.findIndex(e => e.key === 'fire');
      vi.mocked(startAnimate).mockClear();
      fireEvent.click(screen.getByText('fs-prev'));
      await waitFor(() => expect(vi.mocked(startAnimate).mock.calls.some(c => c[0] === ANIMATE_EFFECTS[at - 1].key)).toBe(true));
      expect(setPins).not.toHaveBeenCalled();
    });

    it('offers no fullscreen on a selection reaching outside the tab, and closes it when the selection does', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' }, b: { kind: 'mirror' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));
      fireEvent.click(screen.getByText('select-a'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'lighting.fullscreen' })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'lighting.fullscreen' }));
      expect(screen.getByTestId('fullscreen')).toBeTruthy();

      // Beside a card pinned to Mirror, the selection is not all on Animation: no effect to edit.
      fireEvent.click(screen.getByText('select-ab'));
      await waitFor(() => expect(screen.queryByTestId('fullscreen')).toBeNull());
      expect(screen.queryByRole('button', { name: 'lighting.fullscreen' })).toBeNull();

      fireEvent.click(screen.getByText('select-a'));
      await waitFor(() => expect(screen.getByRole('button', { name: 'lighting.fullscreen' })).toBeTruthy());
      expect(screen.queryByTestId('fullscreen')).toBeNull();
    });
  });

  describe('Mirror tab', () => {
    beforeEach(() => {
      syncState.mode = 'screen';
      syncState.rawSync = 'screen';
    });

    it('a screen pick with cards selected gives only them Mirror; with none it is global', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('mode-controls')).toBeTruthy());
      const pinWrites = vi.mocked(setPins).mock.calls.length;
      fireEvent.click(screen.getByText('selection-pick'));
      expect(vi.mocked(setPins).mock.calls.length).toBe(pinWrites);
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(await screen.findByText('selection-pick'));
      expect(lastPinsCall()).toEqual([['a'], { kind: 'mirror' }]);
    });

    it('the Mirror tab re-pins a shader-pinned selection without touching the global mode', async () => {
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));
      fireEvent.click(screen.getByText('select-a'));
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('screen'));
      vi.mocked(startAnimate).mockClear();
      fireEvent.click(screen.getByText('tab:screen'));
      expect(lastPinsCall()).toEqual([['a'], { kind: 'mirror' }]);
      expect(startAnimate).not.toHaveBeenCalled();
    });

    it('draws no media still while Media is the global mode', async () => {
      syncState.mode = 'gif';
      syncState.rawSync = 'gif';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('gif'));
      // Media is global: the canvas stream already shows it.
      expect(screen.queryByTestId('media-backdrop')).toBeNull();
    });

    it('draws the media still on the Media tab opened for a selection while another mode runs', async () => {
      syncState.mode = 'animate';
      syncState.rawSync = 'fire';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('animate'));
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(screen.getByText('tab:gif'));
      await waitFor(() => expect(screen.getByTestId('media-backdrop')).toBeTruthy());
    });

    it('draws no mirror preview while Mirror is the global mode', async () => {
      syncState.mode = 'screen';
      syncState.rawSync = 'screen';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('screen'));
      // Mirror is global: the output stream already is the capture.
      expect(screen.queryByTestId('mirror-backdrop')).toBeNull();
    });

    it('draws the live mirror preview on the Mirror tab opened for a selection while another mode runs, and keeps it once deselected', async () => {
      syncState.mode = 'animate';
      syncState.rawSync = 'fire';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('tabs').dataset.active).toBe('animate'));
      expect(screen.queryByTestId('mirror-backdrop')).toBeNull();
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(screen.getByText('tab:screen'));
      await waitFor(() => expect(screen.getByTestId('mirror-backdrop')).toBeTruthy());
      fireEvent.click(screen.getByText('clear-selection'));
      expect(screen.getByTestId('mirror-backdrop')).toBeTruthy();
      fireEvent.click(screen.getByText('tab:animate'));
      await waitFor(() => expect(screen.queryByTestId('mirror-backdrop')).toBeNull());
    });

    it('keeps the Mirror dock editable for a mixed selection', async () => {
      localStorage.setItem('nexus.lighting.effectDockCollapsed', 'false');
      withDevices('a', 'b');
      vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' } }));
      renderPage();
      await waitFor(() => expect(pinOf()?.effect).toBe('aurora'));
      fireEvent.click(screen.getByText('select-ab'));
      await waitFor(() => expect(screen.getByTestId('type-intensity').dataset.mode).toBe('screen'));
      expect(screen.getByTestId('type-intensity').closest('[inert]')).toBeNull();
    });

    it('switching tabs with nothing selected changes the global mode and never pins', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('mode-controls')).toBeTruthy());
      fireEvent.click(screen.getByText('tab:static'));
      await waitFor(() => expect(startStatic).toHaveBeenCalled());
      expect(setPins).not.toHaveBeenCalled();
    });

    it('a tab press with cards selected gives only them that mode', async () => {
      renderPage();
      await waitFor(() => expect(screen.getByTestId('mode-controls')).toBeTruthy());
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.click(screen.getByText('tab:static'));
      expect(lastPinsCall()[0]).toEqual(['a']);
      expect(lastPinsCall()[1]).toMatchObject({ kind: 'static', effect: 'checker' });
      fireEvent.click(screen.getByText('tab:gif'));
      expect(lastPinsCall()).toEqual([['a'], { kind: 'media' }]);
      expect(startStatic).not.toHaveBeenCalled();
    });
  });

  it('badges the grid cells with the names of the devices pinned to them', async () => {
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ a: { kind: 'animate', effect: 'aurora' } }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('grid-pins').textContent).toBe('aurora=Fan A'));
  });

  it('a typed value reaches the service and is not overwritten by its own commit', async () => {
    localStorage.setItem('nexus.lighting.effectDockCollapsed', 'false');
    renderPage();
    await waitFor(() => expect(screen.getByTestId('type-intensity').dataset.effect).toBe('fire'));
    // Mount hydration restarts the running effect; let it land before typing.
    await waitFor(() => expect(startAnimate).toHaveBeenCalled());
    vi.mocked(startAnimate).mockClear();
    vi.mocked(saveAnimateTemplates).mockClear();
    fireEvent.click(screen.getByTestId('type-intensity'));
    await waitFor(() => expect(screen.getByTestId('type-intensity').dataset.intensity).toBe('0.3'));
    await waitFor(() => expect(startAnimate).toHaveBeenCalled());
    expect(vi.mocked(startAnimate).mock.calls.at(-1)?.[2]).toBe(0.3);
    const saved = vi.mocked(saveAnimateTemplates).mock.calls.at(-1)?.[0] as Record<string, { selected: number; slots: { intensity: number }[] }>;
    expect(saved.fire.slots[saved.fire.selected].intensity).toBe(0.3);
  });

  describe('resuming lighting from Off', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
    // The throttle's trailing timer outlives an unmounted page, so drain it before the next test.
    afterEach(async () => {
      cleanup();
      await act(() => vi.runOnlyPendingTimersAsync());
      vi.useRealTimers();
    });

    it('an Animation tab press with a selection starts the mode globally instead of pinning', async () => {
      syncState.mode = 'none';
      syncState.rawSync = 'none';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail')).toBeTruthy());
      fireEvent.click(screen.getByText('select-a'));
      vi.mocked(setPins).mockClear();
      fireEvent.click(screen.getByText('tab:animate'));
      await waitFor(() => expect(startAnimate).toHaveBeenCalled());
      expect(setPins).not.toHaveBeenCalled();
    });

    it('previews every card on a tab hover, not just the selection', async () => {
      withDevices('a', 'b');
      syncState.mode = 'none';
      syncState.rawSync = 'none';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail')).toBeTruthy());
      fireEvent.click(screen.getByText('select-a'));
      fireEvent.mouseEnter(screen.getByText('tab:animate'));
      expect(screen.getByTestId('rail').dataset.targets).toBe('a,b');
    });

    it('a Static tab press with a selection starts Static globally', async () => {
      syncState.mode = 'none';
      syncState.rawSync = 'none';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail')).toBeTruthy());
      fireEvent.click(screen.getByText('select-a'));
      vi.mocked(setPins).mockClear();
      fireEvent.click(screen.getByText('tab:static'));
      await waitFor(() => expect(startStatic).toHaveBeenCalled());
      expect(setPins).not.toHaveBeenCalled();
    });

    it('with lighting on, the same press with a selection still only pins', async () => {
      syncState.mode = 'static';
      syncState.rawSync = 'static';
      renderPage();
      await waitFor(() => expect(screen.getByTestId('rail')).toBeTruthy());
      fireEvent.click(screen.getByText('select-a'));
      vi.mocked(startAnimate).mockClear();
      fireEvent.click(screen.getByText('tab:animate'));
      await waitFor(() => expect(setPins).toHaveBeenCalled());
      expect(startAnimate).not.toHaveBeenCalled();
    });
  });
});

void within;

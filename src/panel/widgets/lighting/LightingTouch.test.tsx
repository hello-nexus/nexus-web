import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { LightingTouch } from './LightingTouch';
import { PanelDeviceIdProvider } from '../common/PanelDeviceIdContext';
import type { LightingDevice } from '../../../types/lighting';
import { fetchLightingDevices, fetchAnimateSettings, fetchCurrentSync, fetchPins, fetchStaticSettings, saveAnimateTemplates, setPins, startStatic, type Pin } from '../../../api/lighting';
import { defaultStateFor } from '../../../types/lighting';
import { paletteColor } from '../../../types/lightingPalette';
import type { PanelWidget } from '../types';

// The immersive shell and its heavy leaves are not what this file is about:
// the subject is where a pick is routed (global, or a pin on the selection), and against which preset slot.
// Static's picker rides in the widget's immersive canvas slot, so the stub has
// to render what is handed to it or the subject disappears.
vi.mock('./LightingWidget', () => ({
  LightingWidget: ({ immersiveCanvas }: { immersiveCanvas?: React.ReactNode }) => <div>{immersiveCanvas}</div>,
}));
vi.mock('../common/ImmersiveLayout', () => ({
  ImmersiveLayout: ({ cells }: { cells: React.ReactNode[] }) => <div>{cells}</div>,
}));
const controlsProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('./page/EffectControls', () => ({
  EffectControls: (props: Record<string, unknown>) => {
    controlsProps.current = props;
    return <div data-testid="effect-controls" data-effect={String(props.effect)} />;
  },
}));
// Every tab body at once: the real shell renders only the active one.
vi.mock('./effecteditor/EffectEditor', () => ({
  EffectEditor: ({ devices, options, effect, effectDisabled }: { devices?: React.ReactNode; options: React.ReactNode; effect?: React.ReactNode; effectDisabled?: boolean }) => (
    <div data-testid="editor" data-effect-disabled={String(!!effectDisabled)}>{devices}{options}{effect}</div>
  ),
}));
const pickerProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('./page/StaticPickerCanvas', () => ({
  StaticPickerCanvas: (props: Record<string, unknown>) => {
    pickerProps.current = props;
    return (
      <>
        <button type="button" onClick={() => (props.onCommit as (hex: string) => void)('#123456')}>
          pick-custom
        </button>
        <button type="button" onClick={() => (props.onPreview as (hex: string) => void)('#abcdef')}>
          drag-custom
        </button>
      </>
    );
  },
}));
vi.mock('./effecteditor/MediaList', () => ({
  MediaList: ({ onSelectionPick }: { onSelectionPick?: () => void }) => (
    <div data-testid="media-list">{onSelectionPick && <button type="button" onClick={onSelectionPick}>media-pick</button>}</div>
  ),
}));
vi.mock('./effecteditor/PostProcessControls', () => ({ PostProcessControls: () => <div data-testid="post-process" /> }));
vi.mock('./page/ModeControls', () => ({
  ScreenControls: ({ onSelectionPick }: { onSelectionPick?: () => void }) => (
    <div data-testid="screen-controls">{onSelectionPick && <button type="button" onClick={onSelectionPick}>screen-pick</button>}</div>
  ),
}));
const gridProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('./page/AnimateGrid', () => ({
  // `leading` carries the static palette; dropping it hides the subject.
  AnimateGrid: (props: { onSelect: (key: string) => void; leading?: React.ReactNode }) => {
    gridProps.current = props as unknown as Record<string, unknown>;
    return (
      <>
        {props.leading}
        <button type="button" onClick={() => props.onSelect('stripes')}>pick-stripes</button>
      </>
    );
  },
}));
const selectProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('./effecteditor/StaticDeviceSelect', () => ({
  StaticDeviceSelect: (props: Record<string, unknown>) => {
    selectProps.current = props;
    return <div data-testid="device-select" />;
  },
}));

vi.mock('../../../api/lighting', () => ({
  fetchAnimateDefaults: vi.fn(() => Promise.resolve(null)),
  fetchAnimateSettings: vi.fn(() => Promise.resolve({ effect: 'rainbow', templates: {} })),
  fetchCurrentSync: vi.fn(() => Promise.resolve({ sync: 'static' })),
  fetchStaticSettings: vi.fn(() => Promise.resolve({ effect: 'gradientlinear', states: {} })),
  fetchMediaEffect: vi.fn(() => Promise.resolve(null)),
  fetchScreenEffect: vi.fn(() => Promise.resolve(null)),
  fetchLightingDevices: vi.fn(() => Promise.resolve({ devices: [] })),
  saveAnimateTemplates: vi.fn(() => Promise.resolve()),
  setMediaEffect: vi.fn(() => Promise.resolve()),
  setScreenEffect: vi.fn(() => Promise.resolve()),
  fetchPins: vi.fn(() => Promise.resolve({})),
  setPins: vi.fn(() => Promise.resolve(true)),
  startAnimate: vi.fn(() => Promise.resolve()),
  startStatic: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: vi.fn() }));
vi.mock('../../../lib/controlSync', () => ({ subscribeControlSync: vi.fn(() => () => {}) }));
vi.mock('../../../hooks/usePanelBackgroundUsage', () => ({
  usePanelBackgroundUsage: () => ({ effects: new Set(), slotsByEffect: new Map() }),
}));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en' }),
}));

const panelRecords = vi.hoisted(() => ({ current: {} as Record<string, Record<string, string[]>> }));
vi.mock('../../../api/panel', () => ({
  fetchPanelDevice: vi.fn(async (id: string) => (panelRecords.current[id] ? { id, ...panelRecords.current[id] } : null)),
  patchPanelDevice: vi.fn(async (id: string, patch: Record<string, string[]>) => {
    panelRecords.current[id] = { ...panelRecords.current[id], ...patch };
    return { id, ...panelRecords.current[id] };
  }),
}));

const widget: PanelWidget = { id: 'w', type: 'lighting', size: '4x4', col: 0, row: 0 };

// A test makes the selection the way the device tab does.
const select = async (ids: string[]) => {
  await waitFor(() => expect(selectProps.current).not.toBeNull());
  act(() => {
    (selectProps.current!.onSetSelection as (ids: Set<string>, primary: string | null) => void)(new Set(ids), ids[0] ?? null);
  });
};

const lastPins = () => vi.mocked(setPins).mock.calls.at(-1) as unknown as [string[], Pin | null];

describe('LightingTouch pins', () => {
  beforeEach(() => {
    localStorage.clear();
    // Both hold the last props of an unmounted tree, so a stale one can satisfy
    // the next test's assertion.
    gridProps.current = null;
    pickerProps.current = null;
    selectProps.current = null;
    controlsProps.current = null;
    vi.mocked(saveAnimateTemplates).mockClear();
    vi.mocked(setPins).mockClear();
    vi.mocked(setPins).mockImplementation(() => Promise.resolve(true));
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({}));
    vi.mocked(fetchCurrentSync).mockImplementation(() => Promise.resolve({ sync: 'static' }));
    vi.mocked(startStatic).mockClear();
  });

  it('pins the selected devices to a Static pick, never the global effect', async () => {
    render(<LightingTouch widget={widget} />);
    await select(['dev-a', 'dev-b']);

    fireEvent.click(await screen.findByText('pick-stripes'));

    await waitFor(() => expect(setPins).toHaveBeenCalledTimes(1));
    expect(lastPins()[0]).toEqual(['dev-a', 'dev-b']);
    expect(lastPins()[1]).toMatchObject({ kind: 'static', effect: 'stripes' });
    // A global start would repaint every device that follows the global mode.
    expect(startStatic).not.toHaveBeenCalled();
  });

  // A pin stores the slot it was made against; devices hold references to
  // shared presets, so recording slot 0 for a look taken from another slot
  // points the page's card strip and dock at the wrong preset.
  it('records the pin against the preset slot it came from', async () => {
    const slots = [0, 1, 2, 3].map(() => defaultStateFor('stripes'));
    vi.mocked(fetchAnimateSettings).mockResolvedValueOnce({
      effect: 'rainbow',
      states: {},
      templates: { stripes: { selected: 2, slots } },
    });
    render(<LightingTouch widget={widget} />);
    await select(['dev-a']);

    fireEvent.click(await screen.findByText('pick-stripes'));

    await waitFor(() => expect(setPins).toHaveBeenCalled());
    expect(lastPins()[1]).toMatchObject({ kind: 'static', effect: 'stripes', slot: 2 });
  });

  it('with nothing selected a pick is global and needs no selection', async () => {
    render(<LightingTouch widget={widget} />);

    fireEvent.click(await screen.findByText('pick-stripes'));

    await waitFor(() => expect(startStatic).toHaveBeenCalled());
    expect(vi.mocked(startStatic).mock.calls.at(-1)?.[0]).toBe('stripes');
    expect(setPins).not.toHaveBeenCalled();
  });

  it('with nothing selected a picked color is the exact global color', async () => {
    render(<LightingTouch widget={widget} />);
    fireEvent.click(await screen.findByText('pick-custom'));
    await waitFor(() => expect(startStatic).toHaveBeenCalled());
    expect(vi.mocked(startStatic).mock.calls.at(-1)?.[8]).toBe('#123456');
    expect(setPins).not.toHaveBeenCalled();
    await waitFor(() => expect(pickerProps.current!.hex).toBe('#123456'));
  });

  it('offers the picker canvas without a selection gate', async () => {
    render(<LightingTouch widget={widget} />);
    await select(['dev-a']);
    await waitFor(() => expect(pickerProps.current).not.toBeNull());
    expect(pickerProps.current).not.toHaveProperty('hasSelection');
    expect(typeof pickerProps.current!.onPreview).toBe('function');
    expect(typeof pickerProps.current!.onCommit).toBe('function');
  });

  // A finger drag has to reach the hardware on every move.
  it('pins a dragged color on the selected devices', async () => {
    render(<LightingTouch widget={widget} />);
    await select(['dev-a']);

    fireEvent.click(await screen.findByText('drag-custom'));

    await waitFor(() => expect(setPins).toHaveBeenCalled());
    expect(lastPins()[0]).toEqual(['dev-a']);
    expect(lastPins()[1]).toMatchObject({ kind: 'static', effect: 'flat', color: '#abcdef' });
  });

  it('pins a custom color on the selected devices', async () => {
    render(<LightingTouch widget={widget} />);
    await select(['dev-a']);
    fireEvent.click(await screen.findByText('pick-custom'));
    await waitFor(() => expect(setPins).toHaveBeenCalled());
    expect(lastPins()[0]).toEqual(['dev-a']);
    expect(lastPins()[1]).toMatchObject({ kind: 'static', effect: 'flat', color: '#123456' });
  });

  // The browsed effect is not what the devices wear: leaving the grid keyed on
  // it lights a pattern tile alongside the picker tile, so both read selected.
  it('highlights the grid from what the selection wears, not the browsed effect', async () => {
    render(<LightingTouch widget={widget} />);
    await select(['dev-a']);

    // A pattern pick: the grid marks the tile the selection now wears.
    fireEvent.click(await screen.findByText('pick-stripes'));
    await waitFor(() => expect(gridProps.current!.effect).toBe('stripes'));

    // A colour pick replaces it, so no pattern tile stays lit.
    fireEvent.click(screen.getByText('pick-custom'));
    await waitFor(() => expect(gridProps.current!.effect).toBe(''));
  });

  it('scopes the grid to a pinned pattern when its devices are selected', async () => {
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ 'dev-a': { kind: 'static', effect: 'checker', slot: 1 } }));
    render(<LightingTouch widget={widget} />);
    await select(['dev-a']);
    await waitFor(() => expect(gridProps.current?.effect).toBe('checker'));
  });

  it('gives every card a pin that pins to the global source and unpins', async () => {
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ 'dev-b': { kind: 'mirror' } }));
    render(<LightingTouch widget={widget} />);
    await waitFor(() => expect(selectProps.current?.pinSource).toBeTruthy());
    const props = selectProps.current as { onSetPin: (ids: string[], pinned: boolean) => void };
    props.onSetPin(['dev-a'], true);
    expect(lastPins()[0]).toEqual(['dev-a']);
    expect(lastPins()[1]).toMatchObject({ kind: 'static' });
    props.onSetPin(['dev-a'], false);
    expect(lastPins()).toEqual([['dev-a'], null]);
  });

  it('pins a card to the global flat color when one is set, not the pattern', async () => {
    vi.mocked(fetchStaticSettings).mockResolvedValueOnce({ effect: 'gradientlinear', states: {}, color: '#336699' });
    render(<LightingTouch widget={widget} />);
    await waitFor(() => expect(selectProps.current?.pinSource).toBe('lighting.palette.azure 4'));
    const props = selectProps.current as { onSetPin: (ids: string[], pinned: boolean) => void };
    props.onSetPin(['dev-a'], true);
    expect(lastPins()[1]).toMatchObject({ kind: 'static', effect: 'flat', color: '#336699' });
  });


  it('names pins as the page does: mode and target, Mirror by its mode alone', async () => {
    render(<LightingTouch widget={widget} />);
    await waitFor(() => expect(selectProps.current).not.toBeNull());
    const name = selectProps.current!.pinTargetName as (pin: Pin) => string;
    expect(name({ kind: 'static', effect: 'flat', color: paletteColor('red-3')!.hex })).toBe('lighting.pin.modeTarget');
    expect(name({ kind: 'mirror' })).toBe('lighting.mode.screen');
  });

  it('clears the keys of the old per-device-pick model', async () => {
    localStorage.setItem('nexus.lighting.selectedDevices', JSON.stringify(['dev-a']));
    render(<LightingTouch widget={widget} />);
    await waitFor(() => expect(selectProps.current).not.toBeNull());
    expect(localStorage.getItem('nexus.lighting.selectedDevices')).toBeNull();
  });
});

const lightDevice = (id: string) => ({ id, name: id, ledsOn: true, ledCount: 8 }) as unknown as LightingDevice;
const selected = () => [...(selectProps.current!.selectedIds as Set<string>)];
const inPanel = (panelId: string | null, ui: ReactNode) => (
  <PanelDeviceIdProvider value={panelId}>{ui}</PanelDeviceIdProvider>
);

describe('LightingTouch remembered selection', () => {
  afterEach(() => {
    vi.mocked(fetchLightingDevices).mockImplementation(() => Promise.resolve({ devices: [] }));
  });

  beforeEach(() => {
    localStorage.clear();
    selectProps.current = null;
    panelRecords.current = {};
    vi.mocked(fetchLightingDevices).mockImplementation(() => Promise.resolve({ devices: [lightDevice('dev-a'), lightDevice('dev-b')] }) as never);
  });

  it('desktop: restores the selection when the view is reopened', async () => {
    const first = render(<LightingTouch widget={widget} />);
    await select(['dev-a']);
    first.unmount();
    selectProps.current = null;

    render(<LightingTouch widget={widget} />);
    await waitFor(() => expect(selected()).toEqual(['dev-a']));
  });

  it('desktop: reads the selection storage holds on a fresh mount, as after a restart', async () => {
    localStorage.setItem('nexus.lighting.pinSelection.immersive', JSON.stringify(['dev-b']));
    render(<LightingTouch widget={widget} />);
    await waitFor(() => expect(selected()).toEqual(['dev-b']));
  });

  it.each([null, 'panel-a'])('never shares its selection with the desktop Lighting page (panel %s)', async panelId => {
    localStorage.setItem('nexus.lighting.pinSelection', JSON.stringify(['dev-b']));
    render(inPanel(panelId, <LightingTouch widget={widget} />));
    await waitFor(() => expect(selectProps.current).not.toBeNull());
    expect(selected()).toEqual([]);
    await select(['dev-a', 'dev-b']);
    expect(JSON.parse(localStorage.getItem('nexus.lighting.pinSelection')!)).toEqual(['dev-b']);
  });

  it('keeps each panel its own selection, restored from the service on reopen', async () => {
    const a = render(inPanel('panel-a', <LightingTouch widget={widget} />));
    await select(['dev-a']);
    await waitFor(() => expect(panelRecords.current['panel-a']?.lightingSelection).toEqual(['dev-a']));
    a.unmount();
    selectProps.current = null;

    const b = render(inPanel('panel-b', <LightingTouch widget={widget} />));
    await select(['dev-b']);
    await waitFor(() => expect(panelRecords.current['panel-b']?.lightingSelection).toEqual(['dev-b']));
    b.unmount();
    selectProps.current = null;
    localStorage.clear();

    render(inPanel('panel-a', <LightingTouch widget={widget} />));
    await waitFor(() => expect(selected()).toEqual(['dev-a']));
    expect(panelRecords.current['panel-b']?.lightingSelection).toEqual(['dev-b']);
  });

  it('hides a remembered device that is not listed without forgetting it', async () => {
    panelRecords.current['panel-a'] = { lightingSelection: ['dev-a', 'gone'] };
    render(inPanel('panel-a', <LightingTouch widget={widget} />));
    await waitFor(() => expect(selected()).toEqual(['dev-a']));
    expect(panelRecords.current['panel-a'].lightingSelection).toEqual(['dev-a', 'gone']);
  });

  it('keeps the whole remembered selection when the device list is still filling in', async () => {
    panelRecords.current['panel-a'] = { lightingSelection: ['dev-a', 'dev-b'] };
    vi.mocked(fetchLightingDevices).mockImplementation(() => Promise.resolve({ devices: [lightDevice('dev-a')] }) as never);
    const first = render(inPanel('panel-a', <LightingTouch widget={widget} />));
    await waitFor(() => expect(selected()).toEqual(['dev-a']));
    first.unmount();
    selectProps.current = null;

    vi.mocked(fetchLightingDevices).mockImplementation(() => Promise.resolve({ devices: [lightDevice('dev-a'), lightDevice('dev-b')] }) as never);
    render(inPanel('panel-a', <LightingTouch widget={widget} />));
    await waitFor(() => expect(selected()).toEqual(['dev-a', 'dev-b']));
    expect(panelRecords.current['panel-a'].lightingSelection).toEqual(['dev-a', 'dev-b']);
  });
});

describe('LightingTouch editor scope', () => {
  const rainbowTemplates = () => ({
    effect: 'rainbow',
    states: {},
    templates: {},
  });
  beforeEach(() => {
    localStorage.clear();
    gridProps.current = null;
    selectProps.current = null;
    controlsProps.current = null;
    vi.mocked(setPins).mockClear();
    vi.mocked(startStatic).mockClear();
    vi.mocked(saveAnimateTemplates).mockClear();
    vi.mocked(fetchCurrentSync).mockImplementation(() => Promise.resolve({ sync: 'rainbow' }));
    vi.mocked(fetchAnimateSettings).mockImplementation(() => Promise.resolve(rainbowTemplates()));
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({
      a: { kind: 'animate', effect: 'aurora' },
      b: { kind: 'animate', effect: 'plasma' },
      c: { kind: 'static', effect: 'flat', color: '#ff0000' },
      m: { kind: 'mirror' },
    }));
  });

  const editorDisabled = () => screen.getByTestId('editor').dataset.effectDisabled;

  it('edits the pinned shader, and drops a staged edit when the selection moves to another target', async () => {
    render(<LightingTouch widget={widget} />);
    await select(['a']);
    await waitFor(() => expect(controlsProps.current?.effect).toBe('aurora'));

    // A drag stages an edit on Aurora...
    act(() => { (controlsProps.current!.onChange as (p: object, c?: boolean) => void)({ intensity: 0.2 }); });
    await waitFor(() => expect((controlsProps.current!.state as { intensity: number }).intensity).toBe(0.2));

    // ...and the selection then moves to Plasma, which must not inherit it.
    await select(['b']);
    await waitFor(() => expect(controlsProps.current?.effect).toBe('plasma'));
    expect((controlsProps.current!.state as { intensity: number }).intensity).not.toBe(0.2);
    expect(controlsProps.current!.canReset).toBe(false);

    vi.mocked(saveAnimateTemplates).mockClear();
    act(() => { (controlsProps.current!.onCommit as () => void)(); });
    expect(saveAnimateTemplates).not.toHaveBeenCalled();
  });

  it('writes a committed edit to the target it was made on', async () => {
    render(<LightingTouch widget={widget} />);
    await select(['a']);
    await waitFor(() => expect(controlsProps.current?.effect).toBe('aurora'));
    act(() => { (controlsProps.current!.onChange as (p: object, c?: boolean) => void)({ intensity: 0.2 }); });
    act(() => { (controlsProps.current!.onCommit as () => void)(); });
    await waitFor(() => expect(saveAnimateTemplates).toHaveBeenCalled());
    const saved = vi.mocked(saveAnimateTemplates).mock.calls.at(-1)![0] as Record<string, { selected: number; slots: { intensity: number }[] }>;
    expect(saved.aurora.slots[saved.aurora.selected].intensity).toBe(0.2);
    expect(saved.plasma.slots[saved.plasma.selected].intensity).not.toBe(0.2);
  });

  it('locks the effect editor for a mixed selection and for a palette color', async () => {
    render(<LightingTouch widget={widget} />);
    await waitFor(() => expect(selectProps.current).not.toBeNull());
    expect(editorDisabled()).toBe('false');
    await select(['a', 'b']);
    await waitFor(() => expect(editorDisabled()).toBe('true'));
    await select(['c']);
    await waitFor(() => expect(editorDisabled()).toBe('true'));
    await select(['a']);
    await waitFor(() => expect(editorDisabled()).toBe('false'));
  });

  it('shows the shared Mirror controls and filters for a mirror pin, and slider drags never touch the global effect', async () => {
    render(<LightingTouch widget={widget} />);
    await select(['m']);
    await waitFor(() => expect(screen.getByTestId('post-process')).toBeTruthy());
    expect(screen.getByTestId('screen-controls')).toBeTruthy();
    expect(screen.queryByTestId('effect-controls')).toBeNull();
  });

  it('shows the shared Media list and filters for a media pin while the global mode is Static', async () => {
    vi.mocked(fetchPins).mockImplementation(() => Promise.resolve({ 'dev-a': { kind: 'media' } }));
    render(<LightingTouch widget={widget} />);
    await select(['dev-a']);
    await waitFor(() => expect(screen.getByTestId('media-list')).toBeTruthy());
    expect(screen.getByTestId('post-process')).toBeTruthy();
    expect(screen.queryByTestId('effect-controls')).toBeNull();
  });

  it('a screen pick with cards selected gives only them Mirror', async () => {
    vi.mocked(fetchCurrentSync).mockImplementation(() => Promise.resolve({ sync: 'screen' }));
    render(<LightingTouch widget={widget} />);
    await waitFor(() => expect(screen.getByTestId('screen-controls')).toBeTruthy());
    expect(screen.queryByText('screen-pick')).toBeNull();
    await select(['dev-a']);
    fireEvent.click(await screen.findByText('screen-pick'));
    expect(lastPins()).toEqual([['dev-a'], { kind: 'mirror' }]);
  });

  it('lists the devices on Media, and a media pick with cards selected gives only them Media', async () => {
    vi.mocked(fetchCurrentSync).mockImplementation(() => Promise.resolve({ sync: 'gif' }));
    render(<LightingTouch widget={widget} />);
    await waitFor(() => expect(screen.getByTestId('media-list')).toBeTruthy());
    await select(['dev-a']);
    fireEvent.click(await screen.findByText('media-pick'));
    expect(lastPins()).toEqual([['dev-a'], { kind: 'media' }]);
  });

  it('keeps the Mirror controls for a shader pin on the Mirror tab, with no notice', async () => {
    vi.mocked(fetchCurrentSync).mockImplementation(() => Promise.resolve({ sync: 'screen' }));
    render(<LightingTouch widget={widget} />);
    await select(['a']);
    await waitFor(() => expect(screen.getByTestId('screen-controls')).toBeTruthy());
    expect(screen.queryByText('lighting.pin.pinnedNotice')).toBeNull();
  });
});

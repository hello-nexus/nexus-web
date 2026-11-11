import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeakerState } from '../../../api/logitechSpeaker';
import type { ComponentProps } from 'react';
import type { PresetToolbar } from '../../common/PresetToolbar/PresetToolbar';
import { LogitechSpeakerDevicePage } from './LogitechSpeakerDevicePage';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const api = vi.hoisted(() => ({
  fetchSpeaker: vi.fn(),
  setSpeakerEq: vi.fn(),
  setSpeakerSurround: vi.fn(),
  setSpeakerChannel: vi.fn(),
  resetSpeakerChannels: vi.fn(),
  setSpeakerVolume: vi.fn(),
  setSpeakerSubwoofer: vi.fn(),
  saveSpeakerPreset: vi.fn(),
  deleteSpeakerPreset: vi.fn(),
  testSpeakerChannel: vi.fn(),
}));
vi.mock('../../../api/logitechSpeaker', () => api);

// The toolbar has its own tests; here its props are captured and its callbacks called directly.
type ToolbarProps = ComponentProps<typeof PresetToolbar>;
const toolbar = vi.hoisted(() => ({ props: null as unknown }));
vi.mock('../../common/PresetToolbar/PresetToolbar', () => ({
  PresetToolbar: (props: unknown) => { toolbar.props = props; return <div data-testid="presets" />; },
}));
const bar = () => toolbar.props as ToolbarProps;

// jsdom has no PointerEvent, so coordinates would be dropped from every fired event.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const state = (over: Partial<SpeakerState> = {}): SpeakerState => ({
  present: true,
  simulated: false,
  volume: 0.5,
  subwooferLevel: 50,
  eqEnabled: true,
  bands: [...FLAT],
  bandHz: [48, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
  bandMinDb: -20,
  bandMaxDb: 6,
  presets: [
    { name: 'Flat', bands: FLAT, builtIn: true },
    { name: 'Bass Boost', bands: [4, 3, 2, 0, 0, 0, 0, 0, 0, 0], builtIn: true },
    { name: 'Mine', bands: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0], builtIn: false },
  ],
  surroundEnabled: true,
  room: 'gaming',
  channels: ['frontLeft', 'frontRight', 'center', 'subwoofer', 'rearLeft', 'rearRight', 'sideLeft', 'sideRight'],
  channelGains: [1, 1, 1, 1, 1, 1, 1, 1],
  channelMaxGain: 2,
  ...over,
});

async function mount(s: SpeakerState) {
  api.fetchSpeaker.mockResolvedValue(s);
  await act(async () => { render(<LogitechSpeakerDevicePage />); });
}

const P = 'devices.logitechSpeaker.';
const GRAPH_H = 230;
// The graph's own plot: 8px inside a 230px box, -20 dB at the bottom and +6 dB at the top.
const yOf = (db: number) => 8 + (GRAPH_H - 16) * (1 - (db + 20) / 26);
const point = (name: string) => screen.getByRole('slider', { name });
const bandPoints = () => document.querySelectorAll('svg[preserveAspectRatio] circle');
const surround = () => fireEvent.click(screen.getByText(`${P}surround`, { selector: 'button *, button' }));

describe('LogitechSpeakerDevicePage', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    Element.prototype.setPointerCapture = vi.fn();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: GRAPH_H, right: 400, bottom: GRAPH_H, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    vi.useFakeTimers();
    vi.clearAllMocks();
    api.setSpeakerEq.mockImplementation(async () => state());
    api.setSpeakerSurround.mockImplementation(async () => state());
    api.setSpeakerChannel.mockImplementation(async () => state());
    api.resetSpeakerChannels.mockImplementation(async () => state());
    api.setSpeakerVolume.mockImplementation(async () => state());
    api.setSpeakerSubwoofer.mockImplementation(async () => state());
    api.saveSpeakerPreset.mockImplementation(async () => state());
    api.deleteSpeakerPreset.mockImplementation(async () => state());
    api.testSpeakerChannel.mockResolvedValue({ error: false, msg: '' });
  });

  afterEach(() => { vi.useRealTimers(); });

  it('shows a not-found state when no speaker is present, without tabs', async () => {
    await mount(state({ present: false }));
    expect(screen.getByText(`${P}notFound`)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('sets the system volume as a fraction when a value is committed', async () => {
    await mount(state());
    const volume = screen.getByRole('slider', { name: `${P}volume` });
    fireEvent.change(volume, { target: { value: '30' } });
    await act(async () => { fireEvent.keyUp(volume); await vi.advanceTimersByTimeAsync(0); });
    expect(api.setSpeakerVolume).toHaveBeenCalledWith(0.3);
  });

  it('turns Advanced EQ on and off', async () => {
    await mount(state({ eqEnabled: false }));
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ enabled: true });
  });

  it('offers ten editable points while the EQ is on', async () => {
    await mount(state());
    expect(bandPoints()).toHaveLength(10);
    expect(screen.getAllByRole('slider', { name: /Hz$/ })).toHaveLength(10);
  });

  it('offers no editable points while the EQ is off', async () => {
    await mount(state({ eqEnabled: false }));
    expect(bandPoints()).toHaveLength(10);
    expect(screen.queryAllByRole('slider', { name: /Hz$/ })).toHaveLength(0);
  });

  it('writes the whole band array when a band is moved with the arrow keys', async () => {
    await mount(state());
    await act(async () => { fireEvent.keyDown(point('125Hz'), { key: 'ArrowDown' }); await vi.advanceTimersByTimeAsync(0); });
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ bands: [0, 0, -0.5, 0, 0, 0, 0, 0, 0, 0] });
  });

  it('resets to flat only when the curve is not already flat', async () => {
    await mount(state());
    expect(screen.getByRole('button', { name: `${P}flat` })).toBeDisabled();
  });

  it('sends the Flat preset from Reset to flat when the curve is not flat', async () => {
    await mount(state({ bands: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0] }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}flat` })); });
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ preset: 'Flat' });
  });

  it('lists G HUB presets as built-ins and the user presets as presets, marking the active one', async () => {
    await mount(state({ preset: 'Mine', bands: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }));
    expect(bar().builtins?.map(b => b.id)).toEqual(['Flat', 'Bass Boost']);
    expect(bar().presets.map(p => p.id)).toEqual(['Mine']);
    expect(bar().activeId).toBe('Mine');
    expect(bar().activeBuiltinId).toBeNull();
  });

  it('marks a built-in as active and none when the bands were edited by hand', async () => {
    await mount(state({ preset: 'Flat' }));
    expect(bar().activeBuiltinId).toBe('Flat');
    expect(bar().activeId).toBeNull();
  });

  it('shows Manual first when EQ is on and no preset matches, and enables Save', async () => {
    await mount(state());
    expect(bar().activeBuiltinId).toBe('__manual__');
    expect(bar().builtins?.[0].id).toBe('__manual__');
    expect(bar().inlineSave?.disabled).toBe(false);
  });

  it('has no Manual entry and no save while a preset matches', async () => {
    await mount(state({ preset: 'Flat' }));
    expect(bar().builtins?.some(b => b.id === '__manual__')).toBe(false);
    expect(bar().inlineSave?.disabled).toBe(true);
  });

  it('selects nothing and disables save while Advanced EQ is off', async () => {
    await mount(state({ eqEnabled: false, preset: 'Flat' }));
    expect(bar().activeBuiltinId).toBeNull();
    expect(bar().activeId).toBeNull();
    expect(bar().inlineSave?.disabled).toBe(true);
  });

  it('ignores a click on the Manual entry', async () => {
    await mount(state());
    await act(async () => { bar().onSelectBuiltin?.('__manual__'); });
    expect(api.setSpeakerEq).not.toHaveBeenCalled();
  });

  it('shows the preset toolbar on Acoustics only', async () => {
    await mount(state());
    expect(screen.getByTestId('presets')).toBeInTheDocument();
    surround();
    expect(screen.queryByTestId('presets')).toBeNull();
  });

  it('selects a preset by name', async () => {
    await mount(state());
    await act(async () => { bar().onSelectBuiltin?.('Bass Boost'); });
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ preset: 'Bass Boost' });
    await act(async () => { bar().onLoad('Mine'); });
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ preset: 'Mine' });
  });

  it('saves the live bands as a new preset and selects it', async () => {
    await mount(state({ bands: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0] }));
    let result: { error: boolean } | undefined;
    await act(async () => { result = await bar().onCreate(' Night '); });
    expect(api.saveSpeakerPreset).toHaveBeenCalledWith('Night', [2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ preset: 'Night' });
    expect(result?.error).toBe(false);
  });

  it('reports a failed save of a new preset to the prompt', async () => {
    await mount(state());
    api.saveSpeakerPreset.mockResolvedValueOnce(null);
    let result: { error: boolean } | undefined;
    await act(async () => { result = await bar().onCreate('Night'); });
    expect(result?.error).toBe(true);
  });

  it('keeps the built-in names out of reach of a new or renamed preset', async () => {
    await mount(state());
    expect(bar().reservedNames).toEqual(['Flat', 'Bass Boost']);
  });

  it('renames by saving under the new name and removing the old one', async () => {
    await mount(state({ preset: 'Mine', bands: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }));
    await act(async () => { bar().onRename('Mine', 'Evening'); });
    expect(api.saveSpeakerPreset).toHaveBeenCalledWith('Evening', [1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(api.deleteSpeakerPreset).toHaveBeenCalledWith('Mine');
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ preset: 'Evening' });
  });

  it('renames a preset to a different case without deleting it', async () => {
    await mount(state({ preset: 'Mine', bands: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }));
    await act(async () => { bar().onRename('Mine', 'MINE'); });
    expect(api.saveSpeakerPreset).toHaveBeenCalledWith('MINE', [1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(api.deleteSpeakerPreset).not.toHaveBeenCalled();
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ preset: 'MINE' });
  });

  it('says so when a rename saved the new name but could not remove the old one', async () => {
    await mount(state({ preset: 'Mine', bands: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }));
    api.deleteSpeakerPreset.mockResolvedValueOnce(null);
    await act(async () => { bar().onRename('Mine', 'Evening'); });
    expect(screen.getByRole('alert')).toHaveTextContent(`${P}renameIncomplete`);
  });

  it('keeps the old preset when the rename could not be saved', async () => {
    await mount(state({ preset: 'Mine', bands: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }));
    api.saveSpeakerPreset.mockResolvedValueOnce(null);
    await act(async () => { bar().onRename('Mine', 'Evening'); });
    expect(api.deleteSpeakerPreset).not.toHaveBeenCalled();
  });

  it('deletes a user preset', async () => {
    await mount(state({ preset: 'Mine' }));
    await act(async () => { bar().onDelete('Mine'); });
    expect(api.deleteSpeakerPreset).toHaveBeenCalledWith('Mine');
  });

  it('keeps an earlier band change when a second one is made before the first is answered', async () => {
    await mount(state());
    let release!: () => void;
    api.setSpeakerEq.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(state({ bands: [0, 0, -0.5, 0, 0, 0, 0, 0, 0, 0] })); }));
    await act(async () => { fireEvent.keyDown(point('125Hz'), { key: 'ArrowDown' }); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { fireEvent.keyDown(point('250Hz'), { key: 'ArrowDown' }); await vi.advanceTimersByTimeAsync(0); });
    expect(api.setSpeakerEq).toHaveBeenLastCalledWith({ bands: [0, 0, -0.5, -0.5, 0, 0, 0, 0, 0, 0] });
    await act(async () => { release(); });
  });

  it('commits a band dragged across a poll at its dragged value', async () => {
    await mount(state());
    api.fetchSpeaker.mockImplementation(async () => state());
    const band = point('125Hz');
    fireEvent.pointerDown(band, { pointerId: 1, clientX: 0, clientY: yOf(0) });
    fireEvent.pointerMove(band, { pointerId: 1, clientX: 0, clientY: yOf(-7) });
    const before = api.fetchSpeaker.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(api.fetchSpeaker.mock.calls.length).toBeGreaterThan(before);
    expect(point('125Hz')).toHaveAttribute('aria-valuenow', '-7');
    await act(async () => { fireEvent.pointerUp(band, { pointerId: 1 }); await vi.advanceTimersByTimeAsync(0); });
    expect(api.setSpeakerEq).toHaveBeenLastCalledWith({ bands: [0, 0, -7, 0, 0, 0, 0, 0, 0, 0] });
  });

  it('shows a key step at once so a second step while the service is slow builds on it', async () => {
    await mount(state());
    let release!: () => void;
    api.setSpeakerEq.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(state({ bands: [0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0] })); }));
    await act(async () => { fireEvent.keyDown(point('125Hz'), { key: 'ArrowUp' }); await vi.advanceTimersByTimeAsync(0); });
    expect(point('125Hz')).toHaveAttribute('aria-valuenow', '0.5');
    await act(async () => { fireEvent.keyDown(point('125Hz'), { key: 'ArrowUp' }); await vi.advanceTimersByTimeAsync(0); });
    expect(api.setSpeakerEq).toHaveBeenNthCalledWith(1, { bands: [0, 0, 0.5, 0, 0, 0, 0, 0, 0, 0] });
    expect(api.setSpeakerEq).toHaveBeenNthCalledWith(2, { bands: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0] });
    await act(async () => { release(); });
  });

  it('reverts a drag the browser cancelled, without a write, and leaves nothing stuck', async () => {
    await mount(state());
    const band = point('125Hz');
    fireEvent.pointerDown(band, { pointerId: 1, clientX: 0, clientY: yOf(0) });
    fireEvent.pointerMove(band, { pointerId: 1, clientX: 0, clientY: yOf(-7) });
    expect(point('125Hz')).toHaveAttribute('aria-valuenow', '-7');
    await act(async () => { fireEvent.pointerCancel(band, { pointerId: 1 }); await vi.advanceTimersByTimeAsync(0); });
    expect(api.setSpeakerEq).not.toHaveBeenCalled();
    expect(point('125Hz')).toHaveAttribute('aria-valuenow', '0');
    await act(async () => { fireEvent.keyDown(point('250Hz'), { key: 'ArrowDown' }); await vi.advanceTimersByTimeAsync(0); });
    expect(api.setSpeakerEq).toHaveBeenLastCalledWith({ bands: [0, 0, 0, -0.5, 0, 0, 0, 0, 0, 0] });
  });

  it('does not commit a stale band on a plain click after the EQ was turned off mid-drag', async () => {
    await mount(state());
    let eqOn = false;
    api.fetchSpeaker.mockImplementation(async () => state({ eqEnabled: eqOn }));
    const band = point('125Hz');
    fireEvent.pointerDown(band, { pointerId: 1, clientX: 0, clientY: yOf(0) });
    fireEvent.pointerMove(band, { pointerId: 1, clientX: 0, clientY: yOf(-7) });
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    eqOn = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    const again = point('125Hz');
    fireEvent.pointerDown(again, { pointerId: 1, clientX: 0, clientY: yOf(0) });
    await act(async () => { fireEvent.pointerUp(again, { pointerId: 1 }); await vi.advanceTimersByTimeAsync(0); });
    expect(api.setSpeakerEq).not.toHaveBeenCalled();
  });

  it('commits the dragged band when a preset change arrives mid-drag', async () => {
    await mount(state());
    const preset = [4, 3, 0, 0, 0, 0, 0, 0, 0, 0];
    api.fetchSpeaker.mockImplementation(async () => state({ bands: preset }));
    const band = point('125Hz');
    fireEvent.pointerDown(band, { pointerId: 1, clientX: 0, clientY: yOf(0) });
    fireEvent.pointerMove(band, { pointerId: 1, clientX: 0, clientY: yOf(-7) });
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    await act(async () => { fireEvent.pointerUp(band, { pointerId: 1 }); await vi.advanceTimersByTimeAsync(0); });
    expect(api.setSpeakerEq).toHaveBeenLastCalledWith({ bands: [4, 3, -7, 0, 0, 0, 0, 0, 0, 0] });
  });

  it('translates only built-in preset labels and keeps the English name as the id', async () => {
    await mount(state({ preset: 'Flat' }));
    expect(bar().builtins).toEqual([
      { id: 'Flat', label: 'devices.logitechSpeaker.presetName.flat' },
      { id: 'Bass Boost', label: 'devices.logitechSpeaker.presetName.bassBoost' },
    ]);
    expect(bar().presets).toEqual([{ id: 'Mine', name: 'Mine' }]);
  });

  it('drops a half-made band drag when the EQ is turned off', async () => {
    await mount(state());
    api.fetchSpeaker.mockImplementation(async () => state({ eqEnabled: false }));
    const band = point('125Hz');
    fireEvent.pointerDown(band, { pointerId: 1, clientX: 0, clientY: yOf(0) });
    fireEvent.pointerMove(band, { pointerId: 1, clientX: 0, clientY: yOf(-7) });
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    expect(bandPoints()).toHaveLength(10);
    expect(screen.queryByRole('slider', { name: '125Hz' })).toBeNull();
    const dot = document.querySelectorAll('svg[preserveAspectRatio] circle')[2] as SVGCircleElement;
    expect(Number(dot.getAttribute('cy'))).toBeCloseTo(yOf(0), 0);
  });

  it('reports a test sound that did not play', async () => {
    await mount(state());
    surround();
    api.testSpeakerChannel.mockResolvedValueOnce(null);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}channel.center` })); });
    expect(screen.getByRole('alert')).toHaveTextContent(`${P}testFailed`);
  });

  describe('Surround sound', () => {
    it('toggles DTS:X and switches the room', async () => {
      await mount(state({ surroundEnabled: true }));
      surround();
      await act(async () => { fireEvent.click(screen.getByRole('switch')); });
      expect(api.setSpeakerSurround).toHaveBeenCalledWith({ enabled: false });
      await act(async () => { fireEvent.click(screen.getByRole('radio', { name: `${P}movie` })); });
      expect(api.setSpeakerSurround).toHaveBeenCalledWith({ room: 'movie' });
    });

    it('plays a speaker test sound by its channel number on click', async () => {
      await mount(state());
      surround();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}channel.center` })); });
      expect(api.testSpeakerChannel).toHaveBeenCalledWith(2);
    });

    it('steps a speaker volume as a tenth of its gain', async () => {
      await mount(state());
      surround();
      const group = screen.getByRole('group', { name: `${P}volumeOf:{"speaker":"${P}channel.frontRight"}` });
      await act(async () => { fireEvent.click(group.querySelector('button[aria-label="common.increment"]') as HTMLElement); });
      expect(api.setSpeakerChannel).toHaveBeenCalledWith(1, 1.1);
    });

    it('plays every speaker in turn on Test all, and resets the speakers', async () => {
      await mount(state());
      surround();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}testAll` })); });
      for (let i = 0; i < 8; i += 1) await act(async () => { await vi.advanceTimersByTimeAsync(1700); });
      expect(api.testSpeakerChannel.mock.calls.map(c => c[0])).toEqual([0, 2, 1, 7, 5, 4, 6, 3]);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}reset` })); });
      expect(api.resetSpeakerChannels).toHaveBeenCalled();
    });
  });
});

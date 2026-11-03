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

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const state = (over: Partial<SpeakerState> = {}): SpeakerState => ({
  present: true,
  simulated: false,
  volume: 0.5,
  subwooferLevel: 50,
  eqEnabled: true,
  bands: FLAT,
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
const surround = () => fireEvent.click(screen.getByText(`${P}surround`, { selector: 'button *, button' }));

describe('LogitechSpeakerDevicePage', () => {
  beforeEach(() => {
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
    await act(async () => { fireEvent.keyUp(volume); await Promise.resolve(); await new Promise(r => setTimeout(r, 5)); });
    expect(api.setSpeakerVolume).toHaveBeenCalledWith(0.3);
  });

  it('turns Advanced EQ on and off', async () => {
    await mount(state({ eqEnabled: false }));
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ enabled: true });
  });

  it('disables the ten bands while the EQ is off', async () => {
    await mount(state({ eqEnabled: false }));
    const bands = screen.getAllByRole('slider').filter(s => /devices.logitechSpeaker.band:/.test(s.getAttribute('aria-label') ?? ''));
    expect(bands).toHaveLength(10);
    expect(bands.every(b => (b as HTMLInputElement).disabled)).toBe(true);
  });

  it('writes the whole band array when one band is committed', async () => {
    await mount(state());
    const band = screen.getByRole('slider', { name: `${P}band:{"hz":125}` });
    fireEvent.change(band, { target: { value: '-3' } });
    await act(async () => { fireEvent.keyUp(band); await new Promise(r => setTimeout(r, 5)); });
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ bands: [0, 0, -3, 0, 0, 0, 0, 0, 0, 0] });
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

  it('refuses a new preset named like a built-in, and reports a failed save', async () => {
    await mount(state());
    let result: { error: boolean } | undefined;
    await act(async () => { result = await bar().onCreate('flat'); });
    expect(result?.error).toBe(true);
    expect(api.saveSpeakerPreset).not.toHaveBeenCalled();
    api.saveSpeakerPreset.mockResolvedValueOnce(null);
    await act(async () => { result = await bar().onCreate('Night'); });
    expect(result?.error).toBe(true);
  });

  it('renames by saving under the new name and removing the old one', async () => {
    await mount(state({ preset: 'Mine', bands: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }));
    await act(async () => { bar().onRename('Mine', 'Evening'); });
    expect(api.saveSpeakerPreset).toHaveBeenCalledWith('Evening', [1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(api.deleteSpeakerPreset).toHaveBeenCalledWith('Mine');
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ preset: 'Evening' });
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
      vi.useFakeTimers();
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

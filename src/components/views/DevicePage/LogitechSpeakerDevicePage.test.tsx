import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeakerState } from '../../../api/logitechSpeaker';
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

  it('offers rename and delete only for a user preset, and deletes after confirming', async () => {
    await mount(state({ preset: 'Mine', bands: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }));
    expect(screen.getByRole('button', { name: `${P}rename` })).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}deletePreset` })); });
    const confirms = screen.getAllByRole('button', { name: `${P}deletePreset` });
    await act(async () => { fireEvent.click(confirms[confirms.length - 1]); });
    expect(api.deleteSpeakerPreset).toHaveBeenCalledWith('Mine');
  });

  it('hides rename and delete for a built-in preset', async () => {
    await mount(state({ preset: 'Flat' }));
    expect(screen.queryByRole('button', { name: `${P}rename` })).toBeNull();
    expect(screen.queryByRole('button', { name: `${P}deletePreset` })).toBeNull();
  });

  it('saves the live bands as a new preset and selects it', async () => {
    await mount(state({ bands: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0] }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}savePreset` })); });
    fireEvent.change(screen.getByPlaceholderText(`${P}presetName`), { target: { value: ' Night ' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}save` })); });
    expect(api.saveSpeakerPreset).toHaveBeenCalledWith('Night', [2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(api.setSpeakerEq).toHaveBeenCalledWith({ preset: 'Night' });
  });

  it('renames by saving under the new name and removing the old one', async () => {
    await mount(state({ preset: 'Mine', bands: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0] }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}rename` })); });
    fireEvent.change(screen.getByPlaceholderText(`${P}presetName`), { target: { value: 'Evening' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}save` })); });
    expect(api.saveSpeakerPreset).toHaveBeenCalledWith('Evening', [1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(api.deleteSpeakerPreset).toHaveBeenCalledWith('Mine');
  });

  it('refuses a preset name that is already taken', async () => {
    await mount(state());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: `${P}savePreset` })); });
    fireEvent.change(screen.getByPlaceholderText(`${P}presetName`), { target: { value: 'flat' } });
    expect(screen.getByText(`${P}nameTaken`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `${P}save` })).toBeDisabled();
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

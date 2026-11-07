import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogitechSpeakerDevicePage } from './LogitechSpeakerDevicePage';
import type { SpeakerState } from '../../../api/logitechSpeaker';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    language: 'en',
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

const mockGet = vi.fn();
const mockEq = vi.fn();
const mockSurround = vi.fn();
const mockChannel = vi.fn();
const mockVolume = vi.fn();
const mockSub = vi.fn();
const mockSave = vi.fn();
const mockDelete = vi.fn();
const mockTest = vi.fn();

vi.mock('../../../api/logitechSpeaker', () => ({
  getSpeaker: (...a: any[]) => mockGet(...a),
  setSpeakerEq: (...a: any[]) => mockEq(...a),
  setSpeakerSurround: (...a: any[]) => mockSurround(...a),
  setSpeakerChannel: (...a: any[]) => mockChannel(...a),
  setSpeakerVolume: (...a: any[]) => mockVolume(...a),
  setSpeakerSubwoofer: (...a: any[]) => mockSub(...a),
  saveSpeakerPreset: (...a: any[]) => mockSave(...a),
  deleteSpeakerPreset: (...a: any[]) => mockDelete(...a),
  testSpeakerChannel: (...a: any[]) => mockTest(...a),
}));

const P = 'devices.logitechSpeaker.';
const BANDS = [0, 0, -6, -5, -3, -2, -3, -3, -5, -6];

function state(over: Partial<SpeakerState> = {}): SpeakerState {
  return {
    present: true,
    name: 'Logitech G560 Gaming Speaker',
    model: 'G560',
    volume: 0.2,
    subwooferLevel: 70,
    eqEnabled: true,
    bands: BANDS,
    bandHz: [48, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000],
    bandMinDb: -20,
    bandMaxDb: 6,
    preset: 'First Person Shooter (FPS)',
    presets: [
      { name: 'Flat', bands: Array(10).fill(0), builtIn: true },
      { name: 'First Person Shooter (FPS)', bands: BANDS, builtIn: true },
      { name: 'Mine', bands: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], builtIn: false },
    ],
    surroundEnabled: true,
    room: 'gaming',
    channels: ['frontLeft', 'frontRight', 'center', 'subwoofer', 'rearLeft', 'rearRight', 'sideLeft', 'sideRight'],
    channelGains: [1, 1, 1, 1, 1, 1, 1, 1],
    channelMaxGain: 2,
    ...over,
  };
}

function openSurround() {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${P}surround$`) }));
}

beforeEach(() => {
  mockGet.mockResolvedValue(state());
  const echo = async () => state();
  for (const m of [mockEq, mockSurround, mockChannel, mockVolume, mockSub, mockSave, mockDelete]) m.mockImplementation(echo);
  mockTest.mockResolvedValue({ error: false });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LogitechSpeakerDevicePage Acoustics', () => {
  it('draws the ten bands as vertical sliders with their gains, under the preset in use', async () => {
    render(<LogitechSpeakerDevicePage />);

    const sliders = await screen.findAllByRole('slider', { name: /Hz$/ });
    expect(sliders).toHaveLength(10);
    expect(sliders[2]).toHaveAttribute('aria-orientation', 'vertical');
    expect(sliders[2]).toHaveAttribute('aria-valuenow', '-6');
    expect(sliders[2]).toHaveAttribute('aria-valuetext', '-6 dB');
    expect(screen.getAllByText('First Person Shooter (FPS)').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: `${P}bandValue:{"hz":1000}` })).toHaveValue('-2');
  });

  it('moves a band half a step with the arrow keys', async () => {
    render(<LogitechSpeakerDevicePage />);
    const sliders = await screen.findAllByRole('slider', { name: /Hz$/ });

    fireEvent.keyDown(sliders[4], { key: 'ArrowUp' });

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith({ bands: [0, 0, -6, -5, -2.5, -2, -3, -3, -5, -6] }));
  });

  it('takes a typed gain, kept within the speaker range', async () => {
    render(<LogitechSpeakerDevicePage />);
    const field = await screen.findByRole('textbox', { name: `${P}bandValue:{"hz":1000}` });

    fireEvent.input(field, { target: { value: '99' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith({ bands: [0, 0, -6, -5, -3, 6, -3, -3, -5, -6] }));
  });

  it('greys the bands out while the advanced EQ is off', async () => {
    mockGet.mockResolvedValue(state({ eqEnabled: false }));
    render(<LogitechSpeakerDevicePage />);

    const sliders = await screen.findAllByRole('slider', { name: /Hz$/ });
    expect(sliders[0]).toHaveAttribute('aria-disabled', 'true');
    fireEvent.keyDown(sliders[0], { key: 'ArrowUp' });
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('turns the advanced EQ off', async () => {
    render(<LogitechSpeakerDevicePage />);
    fireEvent.click(await screen.findByRole('switch', { name: `${P}advancedEq` }));

    await waitFor(() => expect(mockEq).toHaveBeenCalledWith({ enabled: false }));
  });

  it('saves the bands as a preset and then uses it', async () => {
    render(<LogitechSpeakerDevicePage />);
    fireEvent.click(await screen.findByRole('button', { name: `${P}savePreset` }));
    const name = screen.getByRole('textbox', { name: `${P}presetName` });
    fireEvent.input(name, { target: { value: 'Night' } });
    fireEvent.click(screen.getByRole('button', { name: `${P}save` }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith('Night', BANDS));
    await waitFor(() => expect(mockEq).toHaveBeenCalledWith({ preset: 'Night' }));
  });

  it('says so when the speaker did not take a change', async () => {
    mockEq.mockResolvedValue(null);
    render(<LogitechSpeakerDevicePage />);
    fireEvent.click(await screen.findByRole('button', { name: `${P}flat` }));

    expect(await screen.findByText(`${P}failed`)).toBeInTheDocument();
  });

  it('shows the speaker is not found', async () => {
    mockGet.mockResolvedValue(state({ present: false }));
    render(<LogitechSpeakerDevicePage />);

    expect(await screen.findByText(`${P}notFound`)).toBeInTheDocument();
  });
});

describe('LogitechSpeakerDevicePage Surround sound', () => {
  it('turns DTS:X off', async () => {
    render(<LogitechSpeakerDevicePage />);
    await screen.findAllByRole('slider', { name: /Hz$/ });
    openSurround();
    fireEvent.click(screen.getByRole('switch', { name: `${P}dtsToggle` }));

    await waitFor(() => expect(mockSurround).toHaveBeenCalledWith({ enabled: false }));
  });

  it('plays a test sound from the speaker that is clicked', async () => {
    render(<LogitechSpeakerDevicePage />);
    await screen.findAllByRole('slider', { name: /Hz$/ });
    openSurround();
    fireEvent.click(screen.getByRole('button', { name: `${P}testOne:{"speaker":"${P}channel.center"}` }));

    expect(mockTest).toHaveBeenCalledWith(2);
  });

  it('steps a speaker volume and resets them all', async () => {
    render(<LogitechSpeakerDevicePage />);
    await screen.findAllByRole('slider', { name: /Hz$/ });
    openSurround();
    const higher = screen.getAllByRole('button', { name: `${P}higher` });
    fireEvent.click(higher[0]);

    await waitFor(() => expect(mockChannel).toHaveBeenCalledTimes(1));
    const [channel, gain] = mockChannel.mock.calls[0];
    expect(gain).toBeCloseTo(1.1);
    expect(typeof channel).toBe('number');

    fireEvent.click(screen.getByRole('button', { name: `${P}resetSpeakers` }));
    await waitFor(() => expect(mockChannel).toHaveBeenLastCalledWith(undefined));
  });
});

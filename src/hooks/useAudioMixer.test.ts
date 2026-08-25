// The mid-drag vs released distinction is what keeps the settings store off the
// slider's per-frame path while still remembering the level the user chose.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { AudioMixerState } from '../api/mixer';
import { useAudioMixer } from './useAudioMixer';

const fetchAudioMixer = vi.fn<() => Promise<AudioMixerState | null>>();
const setSessionVolume = vi.fn(() => Promise.resolve(null));
const setSessionMuted = vi.fn(() => Promise.resolve(null));

vi.mock('../api/mixer', () => ({
  fetchAudioMixer: () => fetchAudioMixer(),
  setSessionVolume: (id: string, volume: number, commit: boolean) => setSessionVolume(id, volume, commit),
  setSessionMuted: (id: string, muted: boolean) => setSessionMuted(id, muted),
  setMixerSticky: vi.fn(),
  clearMixerLevels: vi.fn(),
  saveMixerPreset: vi.fn(),
  deleteMixerPreset: vi.fn(),
  applyMixerPreset: vi.fn(),
}));

function state(): AudioMixerState {
  return {
    error: false,
    msg: '',
    supported: true,
    stickyLevels: true,
    presets: [],
    sessions: [{ id: 'game', name: 'Game', volume: 0.5, muted: false, peak: 0, active: true }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchAudioMixer.mockResolvedValue(state());
});

describe('useAudioMixer', () => {
  it('sends a mid-drag move as uncommitted', async () => {
    const { result } = renderHook(() => useAudioMixer(true));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    act(() => result.current.changeVolume('game', 0.3));

    await waitFor(() => expect(setSessionVolume).toHaveBeenCalledWith('game', 0.3, false));
  });

  it('sends the released value as committed', async () => {
    const { result } = renderHook(() => useAudioMixer(true));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    act(() => result.current.commitVolume('game', 0.25));

    expect(setSessionVolume).toHaveBeenCalledWith('game', 0.25, true);
  });

  it('holds the local value so an in-flight frame does not snap the fader back', async () => {
    const { result } = renderHook(() => useAudioMixer(true));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    act(() => result.current.commitVolume('game', 0.25));
    expect(result.current.sessions[0].volume).toBe(0.25);
  });

  it('mutes through the mute route, not the volume one', async () => {
    const { result } = renderHook(() => useAudioMixer(true));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    act(() => result.current.toggleMuted('game', true));

    expect(setSessionMuted).toHaveBeenCalledWith('game', true);
    expect(setSessionVolume).not.toHaveBeenCalled();
    expect(result.current.sessions[0].muted).toBe(true);
  });

  it('reads nothing while disabled', async () => {
    renderHook(() => useAudioMixer(false));
    await Promise.resolve();
    expect(fetchAudioMixer).not.toHaveBeenCalled();
  });
});

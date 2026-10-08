import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHydroShift2CurveScreen } from './useHydroShift2CurveScreen';

const mockGet = vi.fn();

vi.mock('../../../api/hydroshift2Curve', () => ({
  getHydroShift2CurveSettings: (...a: unknown[]) => mockGet(...a),
  setHydroShift2CurveSettings: vi.fn().mockResolvedValue(true),
}));

const base = {
  connected: true,
  screenMode: 'nexus',
  screenSaverMinutes: 0,
  screenSaverBrightness: 40,
  pumpFollowsMotherboard: false,
};

async function clip(settings: Record<string, unknown>, enabled = true) {
  mockGet.mockResolvedValue({ ...base, ...settings });
  const { result } = renderHook(() => useHydroShift2CurveScreen(enabled));
  await act(async () => {});
  return result.current.playingClip;
}

beforeEach(() => mockGet.mockReset());

describe('useHydroShift2CurveScreen playingClip', () => {
  it('is the selected video in video mode', async () => {
    expect(await clip({ screenMode: 'video', video: 'a.mp4' })).toBe('a.mp4');
  });

  it('prefers the clip on the glass, which covers a running screen saver', async () => {
    expect(await clip({ screenMode: 'nexus', playing: 'saver.mp4' })).toBe('saver.mp4');
  });

  it('is null in Nexus panel mode with nothing playing', async () => {
    expect(await clip({ screenMode: 'nexus', video: 'a.mp4' })).toBeNull();
  });

  it('is null when the cooler is not connected', async () => {
    expect(await clip({ connected: false, screenMode: 'video', video: 'a.mp4' })).toBeNull();
  });

  it('does not poll while disabled', async () => {
    expect(await clip({ screenMode: 'video', video: 'a.mp4' }, false)).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });
});

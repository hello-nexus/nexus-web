import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGameScoreSubmission } from './useGameScoreSubmission';
import { getGameScores } from '../../../api/nexusApi';
import { submitGameScore } from '../../../api/cloud';

vi.mock('../../../api/nexusApi', () => ({
  getGameScores: vi.fn(),
  getDeviceId: () => 'device-123',
}));

vi.mock('../../../api/cloud', () => ({
  submitGameScore: vi.fn(),
}));

const mockGetGameScores = vi.mocked(getGameScores);
const mockSubmitGameScore = vi.mocked(submitGameScore);

describe('useGameScoreSubmission', () => {
  beforeEach(() => {
    mockGetGameScores.mockReset();
    mockSubmitGameScore.mockReset();
  });

  it('starts idle', () => {
    const { result } = renderHook(() => useGameScoreSubmission('snake-easy'));
    expect(result.current.status).toBe('idle');
    expect(result.current.entries).toBeNull();
  });

  it('submits a positive score and marks the self rank from the response', async () => {
    mockSubmitGameScore.mockResolvedValue({
      best: 42,
      rank: 3,
      entries: [{ rank: 1, username: 'nova', score: 99 }],
    });
    const { result } = renderHook(() => useGameScoreSubmission('snake-easy'));

    act(() => { void result.current.submit(42, 15_000); });
    expect(result.current.status).toBe('submitting');

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(mockSubmitGameScore).toHaveBeenCalledWith({
      gameType: 'snake-easy',
      score: 42,
      durationMs: 15_000,
      installId: 'device-123',
    });
    expect(mockGetGameScores).not.toHaveBeenCalled();
    expect(result.current.selfRank).toBe(3);
    expect(result.current.entries).toEqual([{ rank: 1, username: 'nova', score: 99 }]);
  });

  it('falls back to a plain read for a zero score, without a self rank', async () => {
    mockGetGameScores.mockResolvedValue({
      total: 1,
      entries: [{ rank: 1, username: null, score: 10 }],
    });
    const { result } = renderHook(() => useGameScoreSubmission('block'));

    act(() => { void result.current.submit(0, 4_000); });
    await waitFor(() => expect(result.current.status).toBe('done'));

    expect(mockSubmitGameScore).not.toHaveBeenCalled();
    expect(mockGetGameScores).toHaveBeenCalledWith('block');
    expect(result.current.selfRank).toBeNull();
    expect(result.current.entries).toEqual([{ rank: 1, username: null, score: 10 }]);
  });

  it('reports an error when the submission fails', async () => {
    mockSubmitGameScore.mockResolvedValue(null);
    const { result } = renderHook(() => useGameScoreSubmission('snake-hard'));

    act(() => { void result.current.submit(7, 1_000); });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.entries).toBeNull();
  });
});

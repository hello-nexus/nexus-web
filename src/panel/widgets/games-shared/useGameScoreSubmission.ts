import { useCallback, useState } from 'react';
import { getDeviceId, getGameScores } from '../../../api/nexusApi';
import { submitGameScore } from '../../../api/cloud';
import type { GameLeaderboardEntry, GameType } from '../../../types/games';

export type GameScoreSubmissionStatus = 'idle' | 'submitting' | 'done' | 'error';

export interface GameScoreSubmissionState {
  status: GameScoreSubmissionStatus;
  entries: GameLeaderboardEntry[] | null;
  // Rank of the just-submitted score. Only set by a real submission (never by
  // name-matching an entry), so a skipped zero-score read never marks a row.
  selfRank: number | null;
}

const IDLE_STATE: GameScoreSubmissionState = { status: 'idle', entries: null, selfRank: null };

/**
 * Reports a finished game's score to the cloud leaderboard and returns the
 * board to render on the game-over screen. A score of 0 is not worth
 * uploading, so that case falls back to a plain read of the existing board
 * instead - the shared behaviour both games' game-over screens need.
 */
export function useGameScoreSubmission(gameType: GameType) {
  const [state, setState] = useState<GameScoreSubmissionState>(IDLE_STATE);

  const submit = useCallback(async (score: number, durationMs: number) => {
    setState({ status: 'submitting', entries: null, selfRank: null });

    if (score <= 0) {
      const res = await getGameScores(gameType);
      setState(res
        ? { status: 'done', entries: res.entries, selfRank: null }
        : { status: 'error', entries: null, selfRank: null });
      return;
    }

    const res = await submitGameScore({ gameType, score, durationMs, installId: getDeviceId() });
    setState(res
      ? { status: 'done', entries: res.entries, selfRank: res.rank }
      : { status: 'error', entries: null, selfRank: null });
  }, [gameType]);

  return { ...state, submit };
}

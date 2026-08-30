import { useCallback, useEffect, useState } from 'react';
import {
  getGameMode, setGameModeEffects, setGameModeState,
  type GameModeEffects, type GameModeSetting, type GameModeStatus,
} from '../api/gameMode';
import { useTopicCallback } from './useMultiplexSocket';

export interface GameModeState {
  status: GameModeStatus | null;
  setState: (state: GameModeSetting) => Promise<void>;
  setEffects: (effects: Partial<GameModeEffects>) => Promise<void>;
}

/**
 * Live Game Mode status. The service broadcasts a revision frame on the
 * "gameMode" topic whenever activity or settings change and the client
 * refetches; there is no poll, so an idle dashboard costs nothing.
 */
export function useGameMode(enabled: boolean): GameModeState {
  const [status, setStatus] = useState<GameModeStatus | null>(null);

  const refresh = useCallback(async () => {
    const next = await getGameMode();
    if (next) setStatus(next);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    getGameMode().then(next => { if (!cancelled && next) setStatus(next); });
    return () => { cancelled = true; };
  }, [enabled]);

  useTopicCallback('gameMode', enabled, () => { void refresh(); });

  const setState = useCallback(async (next: GameModeSetting) => {
    const updated = await setGameModeState(next);
    if (updated) setStatus(updated);
  }, []);

  const setEffects = useCallback(async (next: Partial<GameModeEffects>) => {
    const updated = await setGameModeEffects(next);
    if (updated) setStatus(updated);
  }, []);

  return { status, setState, setEffects };
}

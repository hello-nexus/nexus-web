// Thin client for the local service's Game Mode routes. Envelope-free plain
// JSON, like fps/screentime.
import { fetchService, postService } from './service';

/** The user's setting, not whether Game Mode is currently active. */
export type GameModeSetting = 'auto' | 'on' | 'off';

export interface GameModeGame {
  key: string;
  name: string;
  pid: number;
  sinceMs: number;
}

export interface GameModeEffects {
  holdNotifications: boolean;
  holdBackgroundNetwork: boolean;
  turnPanelDisplaysOff: boolean;
  stopPanelRendering: boolean;
  exitGraceSeconds: number;
}

export interface GameModeStatus {
  state: GameModeSetting;
  active: boolean;
  /** 'auto' | 'manual' | '' while inactive. */
  reason: string;
  activatedUtcMs: number;
  games: GameModeGame[];
  effects: GameModeEffects;
}

export const getGameMode = () => fetchService<GameModeStatus>('/api/game-mode');

export const setGameModeState = (state: GameModeSetting) =>
  postService<GameModeStatus>('/api/game-mode', { state });

export const setGameModeEffects = (effects: Partial<GameModeEffects>) =>
  postService<GameModeStatus>('/api/game-mode/effects', effects);

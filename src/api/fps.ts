// Thin client for the local service's FPS routes: the local-data toggle +
// purge (Privacy & Data) and the per-game summary/session data the Steam
// page reads. Envelope-free like screentime/steam - plain JSON payloads.
import { deleteService, fetchService, postService } from './service';

export interface FpsTrackingStatus {
  enabled: boolean;
}

export interface FpsDeleteResult {
  deleted: number;
}

export interface FpsGameSummary {
  gameKey: string;
  name: string;
  store: string;
  steamAppId: number | null;
  sessions: number;
  focusedSec: number;
  avgFps: number;
  p1Fps: number;
  p99Fps: number;
  minFps: number;
  maxFps: number;
  lastPlayedUtcMs: number;
}

export interface FpsGamesResponse {
  supported: boolean;
  games: FpsGameSummary[];
}

export interface FpsSession {
  id: string;
  startedUtcMs: number;
  endedUtcMs: number;
  focusedSec: number;
  validSec: number;
  avgFps: number;
  p1Fps: number;
  p99Fps: number;
  minFps: number;
  maxFps: number;
  dispW: number;
  dispH: number;
  refreshHz: number;
  fullscreen: boolean;
  capped: boolean;
  capValue: number;
}

export interface FpsSessionsResponse {
  sessions: FpsSession[];
}

export const getFpsTrackingStatus = () =>
  fetchService<FpsTrackingStatus>('/api/fps/tracking');

export const setFpsTrackingEnabled = (enabled: boolean) =>
  postService<FpsTrackingStatus>('/api/fps/tracking', { enabled });

export const deleteFpsAll = () =>
  deleteService<FpsDeleteResult>('/api/fps/all');

export const fetchFpsGames = () =>
  fetchService<FpsGamesResponse>('/api/fps/games');

export const fetchFpsGameSessions = (gameKey: string, limit = 50) =>
  fetchService<FpsSessionsResponse>(`/api/fps/games/${encodeURIComponent(gameKey)}/sessions?limit=${limit}`);

/** Steam's canonical gameKey shape - see plan's "Signature key" decisions. */
export function steamGameKey(appId: number): string {
  return `steam:${appId}`;
}

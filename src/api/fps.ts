// Thin client for the local service's FPS routes: the local-data toggle +
// purge (Privacy & Data) and the per-game summary/session data the Steam
// page reads. Envelope-free like screentime/steam - plain JSON payloads.
import { deleteService, fetchService, postService, resolveHttp, tokenParam } from './service';

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

/** A session row from the range route - carries the game identity the per-game
 *  routes above already know from their own URL, since a range spans games. */
export interface FpsRangeSession {
  id: string;
  gameKey: string;
  name: string;
  store: string;
  startedUtcMs: number;
  endedUtcMs: number;
  avgFps: number;
}

export interface FpsSessionsInRangeResponse {
  sessions: FpsRangeSession[];
}

/** Cover art for one game: the service redirects to the store CDN, or serves
 *  the installed executable's icon when the store has none. 404 when neither
 *  exists, which leaves the caller on its placeholder. */
export const fpsGameArtUrl = (gameKey: string, iconOnly = false) => {
  const query = [tokenParam(), iconOnly ? 'iconOnly=true' : ''].filter(Boolean).join('&');
  return resolveHttp(`/api/fps/games/${encodeURIComponent(gameKey)}/art`) + (query ? `?${query}` : '');
};

export const getFpsTrackingStatus = () =>
  fetchService<FpsTrackingStatus>('/api/fps/tracking');

export const setFpsTrackingEnabled = (enabled: boolean) =>
  postService<FpsTrackingStatus>('/api/fps/tracking', { enabled });

export const deleteFpsAll = () =>
  deleteService<FpsDeleteResult>('/api/fps/all');

export const deleteFpsRange = (from: string, to: string) =>
  deleteService<FpsDeleteResult>(`/api/fps/range?from=${from}&to=${to}`);

export const fetchFpsGames = () =>
  fetchService<FpsGamesResponse>('/api/fps/games');

export const fetchFpsGameSessions = (gameKey: string, limit = 50) =>
  fetchService<FpsSessionsResponse>(`/api/fps/games/${encodeURIComponent(gameKey)}/sessions?limit=${limit}`);

/** Every session overlapping [from, to], newest first - for the monitoring
 *  history FPS overlay's session-range masking and hover-tooltip game name. */
export const fetchFpsSessionsInRange = (from: number, to: number, limit = 200) =>
  fetchService<FpsSessionsInRangeResponse>(`/api/fps/sessions?from=${Math.round(from)}&to=${Math.round(to)}&limit=${limit}`);

/** Deletes one recorded session. */
export const deleteFpsSession = (id: string) =>
  deleteService<FpsDeleteResult>(`/api/fps/sessions/${encodeURIComponent(id)}`);

/** Deletes every recorded session for one game. */
export const deleteFpsGame = (gameKey: string) =>
  deleteService<FpsDeleteResult>(`/api/fps/games/${encodeURIComponent(gameKey)}`);

/** Steam's canonical gameKey shape. */
export function steamGameKey(appId: number): string {
  return `steam:${appId}`;
}

import { fetchService, postService } from './service';

export type SteamPersonaState = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SteamConfigResponse {
  error: boolean;
  msg: string;
  hasApiKey: boolean;
  steamId: string;
  autoDetectedSteamId: string;
}

export interface SteamConfigBody {
  apiKey?: string;
  steamId?: string;
  clearApiKey?: boolean;
}

export interface SteamStatusResponse {
  error: boolean;
  msg: string;
  ready: boolean;
  hasApiKey: boolean;
  steamId: string;
  reason: string;
}

export interface SteamPlayerSummary {
  steamId: string;
  personaName: string;
  profileUrl: string;
  avatar: string;
  avatarMedium: string;
  avatarFull: string;
  personaState: SteamPersonaState;
  communityVisibilityState: number;
  lastLogoff?: number | null;
  gameExtraInfo?: string | null;
  gameId?: string | null;
}

export interface SteamProfileResponse {
  error: boolean;
  msg: string;
  profile: SteamPlayerSummary | null;
  level: number | null;
}

export interface SteamRecentGame {
  appId: number;
  name: string;
  playtime2Weeks: number;
  playtimeForever: number;
  iconHash: string;
}

export interface SteamOwnedGame {
  appId: number;
  name: string;
  playtimeForever: number;
  playtime2Weeks?: number | null;
  iconHash: string;
}

export interface SteamFriendSummary {
  steamId: string;
  personaName: string;
  avatarMedium: string;
  personaState: SteamPersonaState;
  gameExtraInfo?: string | null;
  friendSince: number;
}

export interface SteamAchievement {
  apiName: string;
  achieved: number;
  unlockTime: number;
  name?: string | null;
  description?: string | null;
}

export const fetchSteamConfig = () =>
  fetchService<SteamConfigResponse>('/api/steam/config');

export const saveSteamConfig = (body: SteamConfigBody) =>
  postService<SteamConfigResponse>('/api/steam/config', body);

export const fetchSteamStatus = () =>
  fetchService<SteamStatusResponse>('/api/steam/status');

export const fetchSteamProfile = () =>
  fetchService<SteamProfileResponse>('/api/steam/profile');

export const fetchSteamRecentGames = () =>
  fetchService<SteamRecentGame[]>('/api/steam/recent-games');

export const fetchSteamOwnedGames = () =>
  fetchService<SteamOwnedGame[]>('/api/steam/owned-games');

export const fetchSteamFriends = () =>
  fetchService<SteamFriendSummary[]>('/api/steam/friends');

export const fetchSteamAchievements = (appId: number) =>
  fetchService<SteamAchievement[]>(`/api/steam/achievements/${appId}`);

export const launchSteam = (appId?: number) =>
  postService(appId ? `/api/steam/launch?appId=${appId}` : '/api/steam/launch', {});

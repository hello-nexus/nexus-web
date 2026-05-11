import { fetchService, postService } from './service';

export interface DiscordConfigResponse {
  error: boolean;
  msg: string;
  clientId: string;
  hasClientSecret: boolean;
  configured: boolean;
}

export interface DiscordConfigBody {
  clientId?: string;
  clientSecret?: string;
  clearClientSecret?: boolean;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  accentColor?: string | null;
  globalName?: string | null;
  bannerColor?: string | null;
}

export interface DiscordGuild {
  id: string;
  name: string;
  iconUrl?: string | null;
}

export interface DiscordVoiceParticipant {
  userId: string;
  username: string;
  globalName?: string | null;
  avatarUrl?: string | null;
  mute: boolean;
  deaf: boolean;
  speaking: boolean;
}

export interface DiscordVoiceState {
  channelName: string;
  guildName: string;
  guildId: string;
  channelId: string;
  selfMute: boolean;
  selfDeaf: boolean;
  participants: DiscordVoiceParticipant[];
}

export interface DiscordNotification {
  id: string;
  title: string;
  body: string;
  iconUrl: string;
  channelId: string;
  guildId?: string | null;
  timestamp: number;
  senderName: string;
  senderAvatarUrl: string;
  mentionEveryone: boolean;
  mentionUser: boolean;
}

export interface DiscordStatusResponse {
  error: boolean;
  msg: string;
  ready: boolean;
  configured: boolean;
  connected: boolean;
  needsAuthorization: boolean;
  reason: string;
  user?: DiscordUser | null;
  guilds: DiscordGuild[];
  voiceState?: DiscordVoiceState | null;
  notifications: DiscordNotification[];
}

export const fetchDiscordConfig = () =>
  fetchService<DiscordConfigResponse>('/api/discord/config');

export const saveDiscordConfig = (body: DiscordConfigBody) =>
  postService<DiscordConfigResponse>('/api/discord/config', body);

export const fetchDiscordStatus = () =>
  fetchService<DiscordStatusResponse>('/api/discord/status');

export const launchDiscord = () =>
  postService('/api/discord/launch', {});

export const openDiscordPath = (path: string) =>
  postService('/api/discord/open', { path });

export const setDiscordMute = (enabled: boolean) =>
  postService('/api/discord/voice/mute', { enabled });

export const setDiscordDeaf = (enabled: boolean) =>
  postService('/api/discord/voice/deaf', { enabled });

export const disconnectDiscordVoice = () =>
  postService('/api/discord/voice/disconnect', {});

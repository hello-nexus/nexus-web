import { fetchService, postService } from './service';

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

export interface DiscordPresenceResponse {
  error: boolean;
  msg: string;
  /** False when the build carries no Discord application id, which hides the control. */
  available: boolean;
  enabled: boolean;
  preset: string;
  presets: string[];
  connected: boolean;
}

export interface DiscordPresenceBody {
  enabled?: boolean;
  preset?: string;
}

export const fetchDiscordStatus = () =>
  fetchService<DiscordStatusResponse>('/api/discord/status');

export const launchDiscord = () =>
  postService('/api/discord/launch', {});

export const setDiscordMute = (enabled: boolean) =>
  postService('/api/discord/voice/mute', { enabled });

export const setDiscordDeaf = (enabled: boolean) =>
  postService('/api/discord/voice/deaf', { enabled });


export const fetchDiscordPresence = () =>
  fetchService<DiscordPresenceResponse>('/api/discord/presence');

export const saveDiscordPresence = (body: DiscordPresenceBody) =>
  postService<DiscordPresenceResponse>('/api/discord/presence', body);

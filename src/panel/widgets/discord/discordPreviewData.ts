// Catalog preview fixture - fake server payloads, untranslated by design.
// ONE complete full-state snapshot, independent of widget size: every tab the
// widget can show at any size renders from this. Keep in sync with what
// DiscordWidget renders (see .agents/rules/widget-preview-fixtures.md in the
// master repo).
import type {
  DiscordGuild,
  DiscordNotification,
  DiscordStatusResponse,
  DiscordVoiceParticipant,
} from '../../../api/discord';
import { previewAvatarUri } from '../common/previewAssets';

// One null iconUrl exercises the initials-fallback branch in ServersTab.
const GUILDS: DiscordGuild[] = [
  { id: '9001', name: 'Night Shift', iconUrl: previewAvatarUri(264) },
  { id: '9002', name: 'Pixel Forge', iconUrl: previewAvatarUri(36) },
  { id: '9003', name: 'Raid Group', iconUrl: null },
  { id: '9004', name: 'Synthwave Lounge', iconUrl: previewAvatarUri(312) },
  { id: '9005', name: 'Build Lab', iconUrl: previewAvatarUri(132) },
];

// iconUrl/senderAvatarUrl are mandatory <img> sources (no fallback branch).
const NOTIFICATIONS: DiscordNotification[] = [
  {
    id: '7001', title: 'Vex - #general', body: 'anyone up for a quick match tonight?',
    iconUrl: previewAvatarUri(12), channelId: '5001', guildId: '9001',
    timestamp: 1_700_000_300_000, senderName: 'Vex', senderAvatarUrl: previewAvatarUri(12),
    mentionEveryone: false, mentionUser: true,
  },
  {
    id: '7002', title: 'Marlowe - #builds', body: 'pushed the new loadout spreadsheet',
    iconUrl: previewAvatarUri(96), channelId: '5002', guildId: '9005',
    timestamp: 1_700_000_200_000, senderName: 'Marlowe', senderAvatarUrl: previewAvatarUri(96),
    mentionEveryone: false, mentionUser: false,
  },
  {
    id: '7003', title: 'Juniper', body: 'voice later? bringing the new mix',
    iconUrl: previewAvatarUri(156), channelId: '5003', guildId: null,
    timestamp: 1_700_000_100_000, senderName: 'Juniper', senderAvatarUrl: previewAvatarUri(156),
    mentionEveryone: false, mentionUser: false,
  },
];

const participant = (
  userId: string, username: string, hue: number | null,
  mute: boolean, deaf: boolean, speaking: boolean,
): DiscordVoiceParticipant => ({
  userId, username, globalName: null,
  // null avatar exercises the first-letter fallback branch.
  avatarUrl: hue === null ? null : previewAvatarUri(hue),
  mute, deaf, speaking,
});

export const DISCORD_PREVIEW: DiscordStatusResponse = {
  error: false, msg: '', ready: true, configured: true, connected: true,
  needsAuthorization: false, reason: '',
  user: {
    id: '42', username: 'nova', discriminator: '0', globalName: 'Nova',
    avatarUrl: previewAvatarUri(210), bannerUrl: null, accentColor: null,
    bannerColor: '#5865f2',
  },
  guilds: GUILDS,
  voiceState: {
    channelName: 'General', guildName: 'Night Shift', guildId: '9001', channelId: '5004',
    selfMute: false, selfDeaf: false,
    participants: [
      participant('42', 'nova', 210, false, false, true),
      participant('43', 'vex', 12, true, false, false),
      participant('44', 'castor', null, false, true, false),
    ],
  },
  notifications: NOTIFICATIONS,
};

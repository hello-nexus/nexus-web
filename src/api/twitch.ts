// Client for the service-side Twitch chat reader (nexus-service's
// TwitchChatHub). Chat arrives on the `twitch/chat/{channel}` multiplex topic
// rather than over REST: the service holds one anonymous IRC connection and
// fans it out, which is what makes the widget work on a Q-series panel - that
// panel reaches the service over a USB reverse tunnel and has no internet
// route of its own to dial Twitch or its emote CDN with.
import { resolveHttp, tokenParam } from './service';

/** One run inside a message: a text run, or an emote when `emoteId` is set. */
export interface TwitchChatFragment {
  text: string;
  emoteId: string;
}

export interface TwitchChatMessage {
  /** Monotonic per-channel sequence; frames are merged and de-duplicated on it. */
  seq: number;
  user: string;
  /** `#RRGGBB`, or empty when the sender never picked a colour. */
  color: string;
  fragments: TwitchChatFragment[];
}

export interface TwitchChatFrame {
  channel: string;
  connected: boolean;
  /**
   * Whether the channel is a real Twitch account: true once it answers the
   * JOIN with ROOMSTATE, false once it stayed silent past the probe window,
   * null while that is outstanding. Twitch accepts a JOIN for any name, so the
   * reply is the only thing separating a typo from a quiet channel. It says
   * nothing about the stream being live: an offline channel answers the same.
   */
  exists: boolean | null;
  /** Empty when the frame only reports a connection-state change. */
  messages: TwitchChatMessage[];
}

/** Twitch logins are `[a-zA-Z0-9_]{1,25}`; mirrors the service-side guard. */
const CHANNEL_PATTERN = /^[a-zA-Z0-9_]{1,25}$/;

export function isValidTwitchChannel(channel: string): boolean {
  return CHANNEL_PATTERN.test(channel);
}

/** Normalized channel login, or null when the configured value can't be joined. */
export function normalizeTwitchChannel(raw: string | undefined): string | null {
  const trimmed = (raw ?? '').trim().replace(/^#/, '');
  return isValidTwitchChannel(trimmed) ? trimmed.toLowerCase() : null;
}

export function twitchChatTopic(channel: string): string {
  return `twitch/chat/${channel}`;
}

/** Service-proxied emote image; the CDN is not reachable from every panel. */
export function twitchEmoteUrl(emoteId: string): string {
  const base = resolveHttp(`/api/twitch/emote/${encodeURIComponent(emoteId)}`);
  const tok = tokenParam();
  return tok ? `${base}?${tok}` : base;
}

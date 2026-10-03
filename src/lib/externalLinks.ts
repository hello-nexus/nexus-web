// External destinations shared across the app, so the targets live in one place.
import type { Language } from './settings';

export const DISCORD_INVITE_URL = 'https://discord.gg/MXAuxKKfVM';
export const AI_INTEGRATION_GUIDE_URL = 'https://hellonexus.com/docs/guides/ai/mcp-server';
export const GAME_SYNC_GUIDE_URL = 'https://hellonexus.com/docs/guides/lighting/game-sync';
// The guide's own "Which games are supported" section - the heading id the
// docs engine slugs from that title.
export const GAME_SYNC_SUPPORTED_GAMES_URL = `${GAME_SYNC_GUIDE_URL}#which-games-are-supported`;

// The site serves each app language under /<lowercased tag>/docs, English at /docs.
export function troubleshootingUrl(page: 'q-series-panels' | 'y70-touch', language: Language): string {
  const prefix = language === 'en' ? '' : `/${language.toLowerCase()}`;
  return `https://hellonexus.com${prefix}/docs/troubleshooting/${page}`;
}

// Per-brand setup guides. Absolute, not ServiceGatePage's relative
// marketingHref: this page is served by the local service, where a bare
// /docs path resolves to the service itself.
export const SMART_LIGHT_GUIDE_URLS: Readonly<Record<string, string>> = {
  hue: 'https://hellonexus.com/docs/guides/lighting/connect-hue',
  govee: 'https://hellonexus.com/docs/guides/lighting/connect-govee',
};

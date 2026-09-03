// External destinations shared by the top-bar menu, the command palette, and
// the Smart Lights page, so the invite/repo/docs targets live in one place.

export const DISCORD_INVITE_URL = 'https://discord.gg/MXAuxKKfVM';
export const GITHUB_ISSUES_URL = 'https://github.com/hello-nexus/nexus-service/issues';
export const AI_INTEGRATION_GUIDE_URL = 'https://hellonexus.com/docs/guides/monitoring/ai-integration';

// Per-brand setup guides. Absolute, not ServiceGatePage's relative
// marketingHref: this page is served by the local service, where a bare
// /docs path resolves to the service itself.
export const SMART_LIGHT_GUIDE_URLS: Readonly<Record<string, string>> = {
  hue: 'https://hellonexus.com/docs/guides/lighting/connect-hue',
  govee: 'https://hellonexus.com/docs/guides/lighting/connect-govee',
};

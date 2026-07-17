// Contract-shaped fixture for GET /monitoring/process-icon, used only as a
// dev-build fallback while the service route is still being built (parallel
// branch) - lets the icon treatment be visually verified before it lands.
// A curated handful of common process names resolve to a small deterministic
// SVG glyph (a colored rounded square with the app's first letter); any
// other name returns null, matching the real endpoint's 404-for-unresolved
// contract so the negative-caching path is exercised in dev too.

const KNOWN_COLORS: Record<string, string> = {
  'chrome.exe': '#4285F4',
  'firefox.exe': '#FF7139',
  'Discord.exe': '#5865F2',
  'steam.exe': '#171A21',
  'explorer.exe': '#FFB900',
  'Code.exe': '#007ACC',
  'Spotify.exe': '#1DB954',
  'Nexus': '#8b5cf6',
};

export function mockProcessIcon(name: string): Blob | null {
  const color = KNOWN_COLORS[name];
  if (!color) return null;
  const letter = (name.replace(/\.\w+$/, '')[0] ?? '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">`
    + `<rect width="32" height="32" rx="6" fill="${color}"/>`
    + `<text x="16" y="21" font-family="sans-serif" font-size="16" fill="#fff" text-anchor="middle">${letter}</text>`
    + `</svg>`;
  return new Blob([svg], { type: 'image/svg+xml' });
}

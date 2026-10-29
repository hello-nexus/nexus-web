// Inline SVG data-URIs for preview fixtures - avatar/cover stand-ins that load
// with zero network. Hue-parameterized so list rows don't look cloned.

export function previewAvatarUri(hue: number): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
    + `<rect width="64" height="64" fill="hsl(${hue} 32% 28%)"/>`
    + `<circle cx="32" cy="24" r="11" fill="hsl(${hue} 36% 60%)"/>`
    + `<ellipse cx="32" cy="52" rx="17" ry="12" fill="hsl(${hue} 36% 60%)"/>`
    + '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Abstract-wallpaper fixture for the gallery: soft diagonal gradient with
// large interlacing translucent circles. 2:1 so it fills the 4x2 picker tile
// edge-to-edge under object-fit: contain.
export function previewWallpaperUri(hue: number): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    + `<stop offset="0" stop-color="hsl(${hue} 42% 30%)"/>`
    + `<stop offset="1" stop-color="hsl(${(hue + 60) % 360} 45% 15%)"/>`
    + '</linearGradient></defs>'
    + '<rect width="320" height="160" fill="url(#g)"/>'
    + `<circle cx="95" cy="92" r="78" fill="hsl(${(hue + 30) % 360} 50% 58% / 0.16)"/>`
    + `<circle cx="185" cy="58" r="96" fill="hsl(${(hue + 80) % 360} 55% 62% / 0.12)"/>`
    + `<circle cx="258" cy="122" r="68" fill="hsl(${hue} 60% 66% / 0.15)"/>`
    + '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Chat-emote stand-in for the Twitch fixture: the real emote art comes from
// the service's CDN proxy, which a preview must not call.
export function previewEmoteUri(hue: number): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    + `<rect width="32" height="32" rx="9" fill="hsl(${hue} 55% 42%)"/>`
    + `<circle cx="11" cy="13" r="3" fill="hsl(${hue} 60% 92%)"/>`
    + `<circle cx="21" cy="13" r="3" fill="hsl(${hue} 60% 92%)"/>`
    + `<path d="M9 20q7 6 14 0" stroke="hsl(${hue} 60% 92%)" stroke-width="3" fill="none" stroke-linecap="round"/>`
    + '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Album-cover fixture for the media widget: a banded sun over a horizon, so
// the player shows a cover instead of the no-art music glyph.
export function previewAlbumArtUri(hue: number): string {
  const sky = `hsl(${(hue + 300) % 360} 55% 16%)`;
  const glow = `hsl(${hue} 65% 42%)`;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">'
    + '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">'
    + `<stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${glow}"/>`
    + '</linearGradient><linearGradient id="u" x1="0" y1="0" x2="0" y2="1">'
    + `<stop offset="0" stop-color="hsl(${(hue + 85) % 360} 95% 62%)"/>`
    + `<stop offset="1" stop-color="hsl(${(hue + 10) % 360} 90% 58%)"/>`
    + '</linearGradient></defs>'
    + '<rect width="160" height="160" fill="url(#s)"/>'
    + '<circle cx="80" cy="98" r="46" fill="url(#u)"/>'
    + `<rect y="100" width="160" height="3" fill="${glow}"/>`
    + `<rect y="108" width="160" height="4" fill="${glow}"/>`
    + `<rect y="117" width="160" height="5" fill="${glow}"/>`
    + `<rect y="124" width="160" height="36" fill="${sky}"/>`
    + `<path d="M0 136h160M0 148h160M80 124v36M40 124l-24 36M120 124l24 36" stroke="hsl(${hue} 85% 62% / 0.55)" stroke-width="1.5"/>`
    + '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Tile gradients for the lighting widget preview: the media album-art family
// (indigo sky, violet and magenta horizon, warm sun), each tile a different
// stop pair and angle. Plain linear-gradient() with hsl stops, so no
// color-mix and no image fetch.
const TILE_STOPS = {
  sky: 'hsl(260 55% 16%)',
  indigo: 'hsl(250 60% 32%)',
  blue: 'hsl(225 70% 40%)',
  violet: 'hsl(275 60% 42%)',
  magenta: 'hsl(320 65% 42%)',
  pink: 'hsl(335 80% 55%)',
  orange: 'hsl(20 90% 56%)',
  sun: 'hsl(45 95% 62%)',
};
const TILE_PAIRS: ReadonlyArray<readonly [keyof typeof TILE_STOPS, keyof typeof TILE_STOPS, number]> = [
  ['blue', 'violet', 135], ['violet', 'magenta', 160], ['magenta', 'sun', 135], ['sky', 'indigo', 180],
  ['indigo', 'pink', 120], ['pink', 'orange', 150], ['sky', 'violet', 135], ['orange', 'sun', 160],
  ['blue', 'indigo', 200], ['violet', 'pink', 145], ['sky', 'magenta', 125], ['magenta', 'orange', 170],
  ['indigo', 'violet', 140], ['pink', 'sun', 130],
];

export function previewTileGradients(): string[] {
  return TILE_PAIRS.map(([a, b, deg]) => `linear-gradient(${deg}deg, ${TILE_STOPS[a]}, ${TILE_STOPS[b]})`);
}

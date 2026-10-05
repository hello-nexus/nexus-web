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

// Effect-thumbnail fixture for the lighting widget: the stock Rainbow animation
// as a full hue sweep, standing in for the service-rendered thumbnail.
export function previewRainbowUri(): string {
  const stops = [0, 60, 120, 180, 240, 300, 360]
    .map((h, i, all) => `<stop offset="${i / (all.length - 1)}" stop-color="hsl(${h} 95% 55%)"/>`)
    .join('');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">'
    + `<defs><linearGradient id="r" x1="0" y1="0" x2="1" y2="0.35">${stops}</linearGradient>`
    + '<linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/>'
    + '<stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient></defs>'
    + '<rect width="320" height="180" fill="url(#r)"/><rect width="320" height="180" fill="url(#v)"/>'
    + '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

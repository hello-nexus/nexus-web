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

export function previewCoverUri(hue: number): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    + `<stop offset="0" stop-color="hsl(${hue} 45% 38%)"/>`
    + `<stop offset="1" stop-color="hsl(${(hue + 70) % 360} 45% 22%)"/>`
    + '</linearGradient></defs>'
    + '<rect width="320" height="180" fill="url(#g)"/>'
    + `<circle cx="252" cy="48" r="26" fill="hsl(${hue} 50% 55% / 0.55)"/>`
    + '</svg>';
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

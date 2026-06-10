// Inline SVG data-URIs for preview fixtures — avatar/cover stand-ins that load
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

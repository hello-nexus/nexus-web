// Loads widget-declared FontFaces on first use and scopes their family
// names so two widgets shipping a font named "led" don't collide. The
// canonical name surfaced to the renderer is `<widget-id>__<font-name>`;
// the manifest's text/value meters reference `font-family: led` via the
// `fontFamily` prop, which the renderer rewrites to the scoped name.

import type { WidgetManifestFont } from '../types';

const loaded = new Set<string>();

export function scopedFontName(widgetId: string, fontName: string): string {
  return `${sanitize(widgetId)}__${sanitize(fontName)}`;
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function loadWidgetFonts(widgetId: string, fonts: WidgetManifestFont[] | undefined): Promise<void> {
  if (!fonts || fonts.length === 0) return;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  for (const font of fonts) {
    if (!font?.name || !font?.src) continue;
    const family = scopedFontName(widgetId, font.name);
    if (loaded.has(family)) continue;
    const url = resolveAssetUrl(font.src, widgetId);
    try {
      const face = new FontFace(family, `url(${JSON.stringify(url)})`, {
        weight: font.weight ? String(font.weight) : 'normal',
        style: font.style ?? 'normal',
      });
      const loadedFace = await face.load();
      document.fonts.add(loadedFace);
      loaded.add(family);
    } catch {
      // Best-effort: a font that fails to load falls back to the panel default
      // (system typography) instead of failing the widget.
    }
  }
}

function resolveAssetUrl(src: string, widgetId: string): string {
  if (/^(https?:|data:|blob:|\/)/.test(src)) return src;
  return `/widgets-api/installed/${encodeURIComponent(widgetId)}/asset/${src}`;
}

// Fonts a panel theme can draw every widget in; @font-face lives in global.scss.
export const PANEL_FONTS = [
  { id: 'lexend', family: 'Lexend' },
  { id: 'oswald', family: 'Oswald' },
  { id: 'tektur', family: 'Tektur' },
  { id: 'jura', family: 'Jura' },
  { id: 'piazzolla', family: 'Piazzolla' },
] as const;

export type PanelFontId = (typeof PANEL_FONTS)[number]['id'];

export const DEFAULT_PANEL_FONT: PanelFontId = 'lexend';

export const SYSTEM_FONT_PREFIX = 'system:';
const MAX_SYSTEM_FONT_FAMILY = 128;

// An embedded id, or an installed family stored as `system:<family>`.
export type PanelFont = PanelFontId | `${typeof SYSTEM_FONT_PREFIX}${string}`;

export function systemFontValue(family: string): PanelFont {
  return `${SYSTEM_FONT_PREFIX}${family}`;
}

export function systemFontFamily(value: string): string | null {
  if (!value.startsWith(SYSTEM_FONT_PREFIX)) return null;
  const family = value.slice(SYSTEM_FONT_PREFIX.length).trim();
  // Same bound the service applies; it drops longer names.
  return family && family.length <= MAX_SYSTEM_FONT_FAMILY ? family : null;
}

// Null is the app font; a missing or unknown embedded id reads as null. A
// system value is kept (trimmed) whenever it names a family.
export function normalizePanelFont(value?: string | null): PanelFont | null {
  if (!value) return null;
  const system = systemFontFamily(value);
  if (system) return systemFontValue(system);
  return PANEL_FONTS.find(f => f.id === value)?.id ?? null;
}

export function panelFontFamily(id: PanelFontId): string {
  return PANEL_FONTS.find(f => f.id === id)?.family ?? 'Lexend';
}

// Quoted CSS family name; quotes and backslashes in a family name are escaped
// and control characters dropped so a name cannot break out of the string.
export function cssQuoteFamily(family: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = family.replace(/[\u0000-\u001f\u007f]/g, '');
  return `'${clean.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// CSS family for a picker row or preview: the system family, or the embedded face.
export function panelFontCssFamily(font: PanelFont): string {
  const system = systemFontFamily(font);
  return system ? cssQuoteFamily(system) : cssQuoteFamily(panelFontFamily(font as PanelFontId));
}

// Hosts that render the panel on this PC's own OS (desktop deck, promoted
// monitor, Y70, cooler LCDs) can see installed fonts; phone and Q-series
// render on their own device, which has none of them.
const REMOTE_GLASS_SURFACES: ReadonlySet<string> = new Set(['phone', 'q60']);

export function panelSystemFontsAvailable(glassSurface: string | null | undefined): boolean {
  return !!glassSurface && !REMOTE_GLASS_SURFACES.has(glassSurface);
}

// Font stack for a non-default choice; undefined keeps the app stack. Lexend
// stays behind the choice for glyphs it lacks, and for a device without the font.
export function panelFontStack(font: PanelFont | null): string | undefined {
  if (font === null || font === DEFAULT_PANEL_FONT) return undefined;
  const system = systemFontFamily(font);
  const face = system ? cssQuoteFamily(system) : `'${panelFontFamily(font as PanelFontId)}'`;
  return `'Twemoji Country Flags', ${face}, 'Lexend', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;
}

// Panel-root vars for a font choice. --font-sans is set too: the shared _text.scss
// mixins read it directly, so --panel-font alone misses most widget labels.
export function panelFontVars(id: PanelFont | null): Record<string, string> {
  const stack = panelFontStack(id);
  return stack ? { '--panel-font': stack, '--font-sans': stack } : {};
}

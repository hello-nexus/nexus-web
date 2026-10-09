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

// Null is the app font; a missing or unknown id reads as null.
export function normalizePanelFont(value?: string | null): PanelFontId | null {
  return PANEL_FONTS.find(f => f.id === value)?.id ?? null;
}

export function panelFontFamily(id: PanelFontId): string {
  return PANEL_FONTS.find(f => f.id === id)?.family ?? 'Lexend';
}

// Font stack for a non-default choice; undefined keeps the app stack. Lexend
// stays behind the choice for glyphs it lacks.
export function panelFontStack(id: PanelFontId | null): string | undefined {
  if (id === null || id === DEFAULT_PANEL_FONT) return undefined;
  return `'Twemoji Country Flags', '${panelFontFamily(id)}', 'Lexend', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`;
}

// Panel-root vars for a font choice. --font-sans is set too: the shared _text.scss
// mixins read it directly, so --panel-font alone misses most widget labels.
export function panelFontVars(id: PanelFontId | null): Record<string, string> {
  const stack = panelFontStack(id);
  return stack ? { '--panel-font': stack, '--font-sans': stack } : {};
}

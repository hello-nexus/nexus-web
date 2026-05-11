// Dev-only debug font picker. Lives in Tools > Debug font and lets the
// user audition chunky font candidates against the desktop chrome AND the
// panel kiosk surface in lockstep. Choice persists in localStorage.
//
// Override strategy: a single injected <style> element redefines
// --font-sans on :root and --panel-font on .panel-root. !important is used
// because PanelApp.module.scss also redeclares --panel-font on the editor
// backdrop, and we want the picker to win uniformly across all panel
// scopes.

const STYLE_ID = 'qos-debug-font-style';
const LINK_ID = 'qos-debug-font-link';
const PREVIEW_LINK_ID = 'qos-debug-font-preview-link';
const STORAGE_KEY = 'qos_debug_font';

export interface DebugFontDef {
  id: string;
  label: string;
  family: string;
  googleQuery: string;
  // The default tile doubles as the picker's reset affordance: clicking it
  // removes the override entirely so each surface falls back to its own
  // SCSS-declared default (Lexend, loaded once from global.scss).
  isDefault?: boolean;
}

export const DEBUG_FONTS: DebugFontDef[] = [
  { id: 'lexend',    label: 'Lexend',              family: 'Lexend',              googleQuery: 'Lexend:wght@400;500;600;700;800;900',        isDefault: true },
  { id: 'space',     label: 'Space Grotesk',       family: 'Space Grotesk',       googleQuery: 'Space+Grotesk:wght@400;500;600;700' },
  { id: 'nunito',    label: 'Nunito',              family: 'Nunito',              googleQuery: 'Nunito:wght@400;500;600;700;800;900' },
  { id: 'manrope',   label: 'Manrope',             family: 'Manrope',             googleQuery: 'Manrope:wght@400;500;600;700;800' },
  { id: 'jakarta',   label: 'Plus Jakarta Sans',   family: 'Plus Jakarta Sans',   googleQuery: 'Plus+Jakarta+Sans:wght@400;500;600;700;800' },
  { id: 'outfit',    label: 'Outfit',              family: 'Outfit',              googleQuery: 'Outfit:wght@400;500;600;700;800;900' },
  { id: 'sora',      label: 'Sora',                family: 'Sora',                googleQuery: 'Sora:wght@400;500;600;700;800' },
  { id: 'dm-sans',   label: 'DM Sans',             family: 'DM Sans',             googleQuery: 'DM+Sans:wght@400;500;700' },
  { id: 'figtree',   label: 'Figtree',             family: 'Figtree',             googleQuery: 'Figtree:wght@400;500;600;700;800;900' },
  { id: 'bricolage', label: 'Bricolage Grotesque', family: 'Bricolage Grotesque', googleQuery: 'Bricolage+Grotesque:wght@400;500;600;700;800' },
  { id: 'hanken',    label: 'Hanken Grotesk',      family: 'Hanken Grotesk',      googleQuery: 'Hanken+Grotesk:wght@400;500;600;700;800;900' },
];

export const DEFAULT_FONT_ID = DEBUG_FONTS.find(f => f.isDefault)?.id ?? DEBUG_FONTS[0].id;

export interface DebugFontState {
  fontId: string;
}

export function loadDebugFont(): DebugFontState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.fontId !== 'string') return null;
    if (!DEBUG_FONTS.some(f => f.id === parsed.fontId)) return null;
    return { fontId: parsed.fontId };
  } catch {
    return null;
  }
}

export function saveDebugFont(state: DebugFontState | null): void {
  if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  else localStorage.removeItem(STORAGE_KEY);
}

function ensureLink(id: string, href: string): void {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== href) link.href = href;
}

function removeNode(id: string): void {
  document.getElementById(id)?.remove();
}

function ensureStyle(css: string): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}

export function applyDebugFont(state: DebugFontState | null): void {
  if (!state) {
    removeNode(STYLE_ID);
    removeNode(LINK_ID);
    return;
  }
  const font = DEBUG_FONTS.find(f => f.id === state.fontId);
  if (!font) {
    removeNode(STYLE_ID);
    removeNode(LINK_ID);
    return;
  }

  // The default font (Lexend) is self-hosted via global.scss @font-face.
  // The picker only needs the CDN to audition non-default candidates.
  if (font.isDefault) {
    removeNode(LINK_ID);
  } else {
    ensureLink(LINK_ID, `https://fonts.googleapis.com/css2?family=${font.googleQuery}&display=swap`);
  }

  const css =
    `:root { --font-sans: 'Twemoji Country Flags', '${font.family}', system-ui, sans-serif !important; }\n` +
    `.panel-root { --panel-font: '${font.family}', 'Lexend', system-ui, sans-serif !important; }`;

  ensureStyle(css);
}

export function ensureAllPreviewFonts(): void {
  // Skip the self-hosted default (Lexend) - global.scss already loads it.
  // Fetching it again from the CDN would re-introduce the offline / iOS-
  // pinning failure mode the self-host fixes.
  const families = DEBUG_FONTS.filter(f => !f.isDefault).map(f => 'family=' + f.googleQuery);
  if (families.length === 0) {
    removeNode(PREVIEW_LINK_ID);
    return;
  }
  const href = `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
  ensureLink(PREVIEW_LINK_ID, href);
}

export function bootDebugFont(): void {
  applyDebugFont(loadDebugFont());
  // The floating desktop overlay (OverlayShell, hosted in a separate WebView2
  // per monitor) shares this origin's localStorage but not its DOM. Listen
  // for cross-document storage writes so the overlay webviews re-apply the
  // picked font when the main app updates the picker.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    applyDebugFont(loadDebugFont());
  });
}

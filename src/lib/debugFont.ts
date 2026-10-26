// Dev-only debug font picker (Tools > Debug font). Auditions font candidates
// against the desktop chrome and the panel kiosk surface. Choice persists in
// localStorage. Every candidate is self-hosted (styles/global.scss), so
// the picker never reaches a font CDN.
//
// A single injected <style> redefines --font-sans on :root and --panel-font
// on .panel-root. --panel-font is a :root alias of --font-sans (variables.scss),
// so the :root rule already reaches every panel surface; the .panel-root rule
// keeps the kiosk pinned if a panel theme ever scopes its own font.

const STYLE_ID = 'nexus-debug-font-style';
const STORAGE_KEY = 'nexus_debug_font';

export interface DebugFontDef {
  id: string;
  label: string;
  family: string;
  // The default tile doubles as the picker's reset affordance: clicking it
  // removes the override entirely so each surface falls back to its own
  // SCSS-declared default (Lexend, loaded once from global.scss).
  isDefault?: boolean;
}

export const DEBUG_FONTS: DebugFontDef[] = [
  { id: 'lexend',    label: 'Lexend',              family: 'Lexend',              isDefault: true },
  { id: 'space',     label: 'Space Grotesk',       family: 'Space Grotesk' },
  { id: 'nunito',    label: 'Nunito',              family: 'Nunito' },
  { id: 'manrope',   label: 'Manrope',             family: 'Manrope' },
  { id: 'jakarta',   label: 'Plus Jakarta Sans',   family: 'Plus Jakarta Sans' },
  { id: 'outfit',    label: 'Outfit',              family: 'Outfit' },
  { id: 'sora',      label: 'Sora',                family: 'Sora' },
  { id: 'dm-sans',   label: 'DM Sans',             family: 'DM Sans' },
  { id: 'figtree',   label: 'Figtree',             family: 'Figtree' },
  { id: 'bricolage', label: 'Bricolage Grotesque', family: 'Bricolage Grotesque' },
  { id: 'hanken',    label: 'Hanken Grotesk',      family: 'Hanken Grotesk' },
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
    return;
  }
  const font = DEBUG_FONTS.find(f => f.id === state.fontId);
  if (!font) {
    removeNode(STYLE_ID);
    return;
  }

  const css =
    `:root { --font-sans: 'Twemoji Country Flags', '${font.family}', system-ui, sans-serif !important; }\n` +
    `.panel-root { --panel-font: 'Twemoji Country Flags', '${font.family}', 'Lexend', system-ui, sans-serif !important; }`;

  ensureStyle(css);
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

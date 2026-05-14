// Settings persistence layer.
// All settings stored in localStorage, exposed via typed getters/setters.

// ── Constants ────────────────────────────────────────────────────────────────

export const LANGUAGES = ['en', 'zh-TW', 'zh-CN', 'ja', 'ko', 'de', 'fr', 'es', 'it', 'pt', 'pt-BR', 'ru', 'tr', 'pl'] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  'pt-BR': 'Português (Brasil)',
  ru: 'Русский',
  tr: 'Türkçe',
  pl: 'Polski',
};

export const LANGUAGE_FLAGS: Record<Language, string> = {
  en: '\u{1F1FA}\u{1F1F8}',
  'zh-TW': '\u{1F1F9}\u{1F1FC}',
  'zh-CN': '\u{1F1E8}\u{1F1F3}',
  ja: '\u{1F1EF}\u{1F1F5}',
  ko: '\u{1F1F0}\u{1F1F7}',
  de: '\u{1F1E9}\u{1F1EA}',
  fr: '\u{1F1EB}\u{1F1F7}',
  es: '\u{1F1EA}\u{1F1F8}',
  it: '\u{1F1EE}\u{1F1F9}',
  pt: '\u{1F1F5}\u{1F1F9}',
  'pt-BR': '\u{1F1E7}\u{1F1F7}',
  ru: '\u{1F1F7}\u{1F1FA}',
  tr: '\u{1F1F9}\u{1F1F7}',
  pl: '\u{1F1F5}\u{1F1F1}',
};


export const THEME_MODES = ['system', 'dark', 'light'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

// Accent color — user-selectable in Settings. Hex #rrggbb.
// All other accent tokens (glow, deep, soft, glow-shadow, plus the
// matching --accent-text variants) are derived from this single value
// per-theme in applyAccentColor().
export const DEFAULT_ACCENT = '#8b5cf6';

// Preset swatch grid shown in the settings picker. Two rows of ten span ten
// distinct hue families - violet, purple, pink, red, orange, amber, green,
// teal, cyan, blue. Row 1 is the primary choice; row 2 is the same hue family
// pushed darker / more saturated. The previous yellow-green lime column was
// dropped in favor of cyan + a navy row-2 deep blue.
export const PRESET_ACCENTS = [
  // Row 1 - primary family choices
  '#8b5cf6', // Violet (default)
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  // Row 2 - deeper / more saturated siblings, paired by column
  '#6d28d9', // Deep violet
  '#9333ea', // Deep purple
  '#db2777', // Hot pink
  '#b91c1c', // Deep red
  '#c2410c', // Burnt orange
  '#b45309', // Deep amber
  '#15803d', // Forest green
  '#0f766e', // Deep teal
  '#0e7490', // Deep cyan
  '#1e3a8a', // Navy
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeneralSettings {
  language: Language;
  themeMode: ThemeMode;
  accentColor: string;
  startOnLogin: boolean;
  disableConflictAlerts: boolean;
  monitoringShowAverage: boolean;
  monitoringDetailedCollapsed: string[];
  showMacStatusBarIcon: boolean;
  showWindowsTrayIcon: boolean;
}

export interface QosSettings {
  general: GeneralSettings;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

export function getDefaultSettings(): QosSettings {
  return {
    general: {
      language: 'en',
      themeMode: 'system',
      accentColor: DEFAULT_ACCENT,
      startOnLogin: false,
      disableConflictAlerts: false,
      monitoringShowAverage: true,
      monitoringDetailedCollapsed: [],
      showMacStatusBarIcon: true,
      showWindowsTrayIcon: true,
    },
  };
}

// ── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'qos_settings';

const HEX6_RE = /^#[0-9a-f]{6}$/i;

function normalizeAccent(candidate: unknown): string {
  return typeof candidate === 'string' && HEX6_RE.test(candidate)
    ? candidate.toLowerCase()
    : DEFAULT_ACCENT;
}

export function loadSettings(): QosSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const defaults = getDefaultSettings();
      const merged: QosSettings = {
        general: { ...defaults.general, ...parsed.general },
      };
      merged.general.accentColor = normalizeAccent(merged.general.accentColor);
      return merged;
    }
  } catch { /* corrupt data — reset */ }
  return getDefaultSettings();
}

export function saveSettings(settings: QosSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function cachePreferencesLocally(prefs: {
  language?: string; themeMode?: string; accentColor?: string;
  disableConflictAlerts?: boolean; monitoringShowAverage?: boolean;
  monitoringDetailedCollapsed?: string[];
  showMacStatusBarIcon?: boolean;
  showWindowsTrayIcon?: boolean;
}): void {
  const current = loadSettings();
  if (prefs.language) current.general.language = prefs.language as Language;
  if (prefs.themeMode) current.general.themeMode = prefs.themeMode as ThemeMode;
  if (prefs.accentColor) current.general.accentColor = prefs.accentColor;
  if (prefs.disableConflictAlerts !== undefined) current.general.disableConflictAlerts = prefs.disableConflictAlerts;
  if (prefs.monitoringShowAverage !== undefined) current.general.monitoringShowAverage = prefs.monitoringShowAverage;
  if (prefs.monitoringDetailedCollapsed !== undefined) current.general.monitoringDetailedCollapsed = prefs.monitoringDetailedCollapsed;
  if (prefs.showMacStatusBarIcon !== undefined) current.general.showMacStatusBarIcon = prefs.showMacStatusBarIcon;
  if (prefs.showWindowsTrayIcon !== undefined) current.general.showWindowsTrayIcon = prefs.showWindowsTrayIcon;
  saveSettings(current);
}

// ── Theme mode application ───────────────────────────────────────────────────

/** Resolve effective theme: 'dark' or 'light'. */
export function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode;
}

// Last applied accent — kept in-module so applyThemeMode() can re-derive
// shades when the user flips dark ↔ light without needing the caller to
// thread the accent through.
let currentAccent = DEFAULT_ACCENT;

// Match the --bg surface tokens in src/styles/variables.scss. Kept in sync
// manually so the iOS Safari URL bar / overscroll area painted via the
// theme-color meta matches the body background the user actually sees.
const THEME_COLOR_DARK = '#0f0f0f';
const THEME_COLOR_LIGHT = '#f4f4f8';

/**
 * Set the html `data-theme` attribute and the iOS Safari / Chrome address-bar
 * color so the browser chrome (URL bar, overscroll, scrollbars) matches the
 * page background. Caller passes an already-resolved 'dark' | 'light' value;
 * use applyThemeMode if you have a raw ThemeMode (incl. 'system'/'auto').
 *
 * Split out from applyThemeMode so surfaces with independent theme state
 * (e.g. the phone panel, which has its own panel-theme separate from the
 * desktop theme) can update html chrome without touching the desktop accent.
 */
export function applyHtmlChromeTheme(resolved: 'dark' | 'light'): void {
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', resolved === 'light' ? THEME_COLOR_LIGHT : THEME_COLOR_DARK);
  }
}

/** Apply the theme mode by toggling a data attribute on <html>. */
export function applyThemeMode(mode: ThemeMode): void {
  applyHtmlChromeTheme(resolveTheme(mode));
  // Re-derive accent shades for the newly effective theme mode.
  applyAccentColor(currentAccent);
}

/** Listen for OS theme changes when mode is 'system'. Returns a cleanup function. */
export function watchSystemTheme(mode: ThemeMode): () => void {
  if (mode !== 'system') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const handler = () => applyThemeMode('system');
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

// ── Accent color derivation ──────────────────────────────────────────────────

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/** Parse a #rrggbb hex into HSV (h: 0–360, s/v: 0–100). Used by the custom picker. */
export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h, s: s * 100, v: v * 100 };
}

/** Build a #rrggbb hex from HSV (h: 0–360, s/v: 0–100). */
export function hsvToHex(h: number, s: number, v: number): string {
  const sN = s / 100;
  const vN = v / 100;
  const c = vN * sN;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1)      { r = c; g = x; }
  else if (hh < 2) { r = x; g = c; }
  else if (hh < 3) { g = c; b = x; }
  else if (hh < 4) { g = x; b = c; }
  else if (hh < 5) { r = x; b = c; }
  else             { r = c; b = x; }
  const m = vN - c;
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Parse a #rrggbb hex into HSL (h: 0–360, s/l: 0–100). */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslCss(h: number, s: number, l: number, a?: number): string {
  const hh = ((h % 360) + 360) % 360;
  return a !== undefined && a < 1
    ? `hsla(${hh.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%, ${a.toFixed(3)})`
    : `hsl(${hh.toFixed(1)}, ${s.toFixed(1)}%, ${l.toFixed(1)}%)`;
}

/**
 * WCAG relative luminance (0–1) of an HSL color. Used to pick a contrasting
 * foreground — returns true if black text reads better than white on this
 * background. Threshold 0.6 keeps mid-tone violets/blues on white text and
 * flips bright yellow/cyan/lime to black.
 */
function needsDarkTextOnHsl(h: number, s: number, l: number): boolean {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1)      { r = c; g = x; }
  else if (hh < 2) { r = x; g = c; }
  else if (hh < 3) { g = c; b = x; }
  else if (hh < 4) { g = x; b = c; }
  else if (hh < 5) { r = x; b = c; }
  else             { r = c; b = x; }
  const m = lN - c / 2;
  const toLin = (v: number) => {
    const n = v + m;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  return L > 0.6;
}

/**
 * Derive all accent variants for a base hex and apply them as CSS custom
 * properties on <html>. Safe to call on every color-picker input event.
 *
 * Surface tokens (--bg, --bg-elevated, --bg-card, --border, …) stay pure
 * grayscale in both modes — only the accent highlights follow the user's
 * hue. The SCSS fallbacks in variables.scss are the canonical values.
 */
export function deriveAccentVars(hex: string, mode: 'dark' | 'light' = 'dark'): Record<string, string> {
  const safe = normalizeAccent(hex);
  const { h, s, l } = hexToHsl(safe);
  const S = clamp(Math.max(s, 55));
  const accentL = mode === 'dark' ? clamp(l, 50, 66) : clamp(l, 40, 54);
  const glowL   = mode === 'dark' ? clamp(accentL + 10, 58, 80) : clamp(accentL + 8, 48, 68);
  const deepL   = mode === 'dark' ? clamp(accentL - 16, 22, 50) : clamp(accentL - 20, 14, 40);
  const deepS   = clamp(S + 5);
  const softAlpha       = mode === 'dark' ? 0.14 : 0.12;
  const glowShadowAlpha = mode === 'dark' ? 0.45 : 0.35;
  return {
    '--accent':             hslCss(h, S, accentL),
    '--accent-glow':        hslCss(h, S, glowL),
    '--accent-deep':        hslCss(h, deepS, deepL),
    '--accent-soft':        hslCss(h, S, accentL, softAlpha),
    '--accent-glow-shadow': hslCss(h, S, accentL, glowShadowAlpha),
    '--accent-text':        needsDarkTextOnHsl(h, S, accentL) ? '#000000' : '#ffffff',
    '--accent-glow-text':   needsDarkTextOnHsl(h, S, glowL)   ? '#000000' : '#ffffff',
    '--accent-deep-text':   needsDarkTextOnHsl(h, deepS, deepL) ? '#000000' : '#ffffff',
  };
}

export function applyAccentColor(hex: string): void {
  const safe = normalizeAccent(hex);
  currentAccent = safe;

  const effective = document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';
  const { h, s, l } = hexToHsl(safe);

  // Saturation floor: muted picks still need to read as "a color" so the
  // active tab underline and sidebar highlights don't blend into chrome.
  const S = clamp(Math.max(s, 55));

  // Lightness bands enforce contrast with white button text and with the
  // theme background. Dark mode tolerates a brighter base; light mode needs
  // a darker one for the same button pattern.
  const accentL = effective === 'dark' ? clamp(l, 50, 66) : clamp(l, 40, 54);
  const glowL   = effective === 'dark' ? clamp(accentL + 10, 58, 80) : clamp(accentL + 8, 48, 68);
  const deepL   = effective === 'dark' ? clamp(accentL - 16, 22, 50) : clamp(accentL - 20, 14, 40);
  const deepS   = clamp(S + 5);

  const softAlpha       = effective === 'dark' ? 0.14 : 0.12;
  const glowShadowAlpha = effective === 'dark' ? 0.45 : 0.35;

  // Pick black-or-white text for each accent surface based on its luminance.
  // Keeps text legible across the full hue range — dark violets keep white
  // text; bright yellows/limes/cyans flip to black.
  const accentText = needsDarkTextOnHsl(h, S, accentL) ? '#000000' : '#ffffff';
  const glowText   = needsDarkTextOnHsl(h, S, glowL)   ? '#000000' : '#ffffff';
  const deepText   = needsDarkTextOnHsl(h, deepS, deepL) ? '#000000' : '#ffffff';

  const root = document.documentElement.style;
  root.setProperty('--accent',             hslCss(h, S, accentL));
  root.setProperty('--accent-glow',        hslCss(h, S, glowL));
  root.setProperty('--accent-deep',        hslCss(h, deepS, deepL));
  root.setProperty('--accent-soft',        hslCss(h, S, accentL, softAlpha));
  root.setProperty('--accent-glow-shadow', hslCss(h, S, accentL, glowShadowAlpha));
  root.setProperty('--accent-text',        accentText);
  root.setProperty('--accent-glow-text',   glowText);
  root.setProperty('--accent-deep-text',   deepText);
}

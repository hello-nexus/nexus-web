// Settings persistence layer.
// All settings stored in localStorage, exposed via typed getters/setters.
import type { UpdateChannel, UpdateMode } from '../api/update';
import {
  DEFAULT_TEMP_UNIT, DEFAULT_TIME_FORMAT, DEFAULT_NUMBER_FORMAT,
  type TempUnit, type TimeFormat, type NumberFormat,
} from './units';

// ── Constants ────────────────────────────────────────────────────────────────

export const LANGUAGES = ['en', 'zh-TW', 'zh-CN', 'ja', 'ko', 'de', 'fr', 'es', 'it', 'pt', 'pt-BR', 'ru', 'tr', 'pl', 'fur'] as const;
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
  fur: 'Furlan',
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
  // Friûl has no Unicode flag emoji. Required by the exhaustive Record type;
  // the value is unused - GeneralTab special-cases fur and renders its flag
  // from an image asset instead.
  fur: '',
};


export const THEME_MODES = ['system', 'dark', 'light'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

// Dashboard background style. 'glass' = transparent backdrop revealing the
// native OS frosted-glass material, 'gradient' = flowing accent ribbons,
// 'flat' = solid theme color.
export const BACKGROUND_MODES = ['glass', 'gradient', 'flat'] as const;
export type BackgroundMode = (typeof BACKGROUND_MODES)[number];

// Accent source. 'system' tracks the OS accent colour (pushed by the native
// shell); 'custom' uses the user-picked accentColor.
export type AccentSource = 'system' | 'custom';

// Accent color - user-selectable in Settings, hex #rrggbb. Other accent
// tokens (glow, deep, soft, glow-shadow, the --accent-text variants) derive
// from it per-theme in applyAccentColor(). First-paint fallback before
// localStorage or the /defaults cache loads. Must mirror
// nexus-service/data/install-defaults.json → theme.accentColor.
export const DEFAULT_ACCENT = '#2563eb';

// Preset swatch grid for the settings picker. Two rows of ten, paired by
// column: row 1 is the saturated choice, row 2 is the same hue with lower
// saturation and lightness. Deep blue (the default accent) leads.
export const PRESET_ACCENTS = [
  // Row 1 - primary family choices
  '#2563eb', // Deep blue (default)
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#16c963', // Green
  '#0bbfa9', // Teal
  '#06b6d4', // Cyan
  // Row 2 - softer siblings (lower S, darker L), paired by column
  '#3e63b8', // Soft blue
  '#5a85c6', // Soft sky
  '#8e83c0', // Soft violet
  '#b96b94', // Soft pink
  '#bf6363', // Soft red
  '#bd7958', // Soft orange
  '#bd8d42', // Soft amber
  '#5fa07e', // Soft green
  '#509995', // Soft teal
  '#4f9aab', // Soft cyan
] as const;

// Deck button glyph palette. Single source for the picker; deck auto-tints
// (deckIcons CATEGORY_COLOR, deckPreviewData) must stay members of this list
// so a saved slot.color always matches a pickable swatch. Hues deliberately
// differ from PRESET_ACCENTS: configs persist these exact hexes, so changing
// one strands existing slots with a color the picker no longer offers.
export const DECK_SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#a855f7', '#ec4899', '#64748b', '#ffffff',
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeneralSettings {
  language: Language;
  themeMode: ThemeMode;
  accentColor: string;
  backgroundMode: BackgroundMode;
  accentSource: AccentSource;
  startOnLogin: boolean;
  showConflictAlerts: boolean;
  monitoringShowAverage: boolean;
  monitoringDetailedCollapsed: string[];
  showMacStatusBarIcon: boolean;
  showWindowsTrayIcon: boolean;
  // Order of pinnable sidebar apps after the locked Dashboard row. Each
  // entry is a PinnableAppKey ('monitoring' | 'lighting' | 'cooling' |
  // 'devices'). Server-mirrored under ui.pinnedSidebarApps so it follows
  // the profile.
  pinnedSidebarApps: string[];
  // Recently opened unpinned apps, oldest first - the sidebar's below-separator
  // "recently opened" rows. Server-mirrored under ui.recentSidebarApps.
  recentSidebarApps: string[];
  // When true, lighting + cooling widgets render the full controls
  // (animation/mirror/static buttons on lighting, response chart +
  // silent/balanced/turbo chips on cooling); default false (single-icon
  // -with-arrows layout). Client-only, not in the server preferences pipeline.
  widgetAdvancedMode: boolean;
  // Display-unit choices. Server-mirrored under the preferences `units` block
  // so they follow the profile. See lib/units.ts for their meaning. The
  // monitoring temperature unit governs in-app hardware temps only; outdoor
  // weather keeps its own per-widget unit.
  monitoringTempUnit: TempUnit;
  timeFormat: TimeFormat;
  numberFormat: NumberFormat;
  updateMode?: UpdateMode;
  updateChannel?: UpdateChannel;
  lastDismissedUpdateVersion?: string;
}

export interface NexusSettings {
  general: GeneralSettings;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

// First-paint defaults - used only when localStorage is empty AND the
// /defaults cache hasn't loaded yet. Canonical values live in
// nexus-service/data/install-defaults.json (theme.* and monitoring.*); keep
// in sync.
export function getDefaultSettings(): NexusSettings {
  return {
    general: {
      language: 'en',
      themeMode: 'system',
      accentColor: DEFAULT_ACCENT,
      backgroundMode: 'glass',
      accentSource: 'system',
      startOnLogin: false,
      showConflictAlerts: true,
      monitoringShowAverage: true,
      monitoringDetailedCollapsed: [],
      showMacStatusBarIcon: true,
      showWindowsTrayIcon: true,
      pinnedSidebarApps: ['monitoring', 'lighting', 'cooling'],
      recentSidebarApps: [],
      widgetAdvancedMode: false,
      monitoringTempUnit: DEFAULT_TEMP_UNIT,
      timeFormat: DEFAULT_TIME_FORMAT,
      numberFormat: DEFAULT_NUMBER_FORMAT,
    },
  };
}

// ── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'nexus_settings';

const HEX6_RE = /^#[0-9a-f]{6}$/i;

function normalizeAccent(candidate: unknown): string {
  return typeof candidate === 'string' && HEX6_RE.test(candidate)
    ? candidate.toLowerCase()
    : DEFAULT_ACCENT;
}

export function loadSettings(): NexusSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const defaults = getDefaultSettings();
      const merged: NexusSettings = {
        general: { ...defaults.general, ...parsed.general },
      };
      merged.general.accentColor = normalizeAccent(merged.general.accentColor);
      return merged;
    }
  } catch { /* corrupt data - reset */ }
  return getDefaultSettings();
}

export function saveSettings(settings: NexusSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/**
 * The language explicitly persisted in stored settings, or null when none was
 * ever saved. loadSettings() can't make that distinction (it merges defaults,
 * so an unset language reads as 'en'); the marketing site needs it to prefer
 * a saved choice over browser-language detection.
 */
export function loadStoredLanguage(): Language | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const lang: unknown = JSON.parse(raw)?.general?.language;
    return LANGUAGES.includes(lang as Language) ? (lang as Language) : null;
  } catch {
    return null;
  }
}

export function cachePreferencesLocally(prefs: {
  language?: string; themeMode?: string; accentColor?: string;
  showConflictAlerts?: boolean; monitoringShowAverage?: boolean;
  monitoringDetailedCollapsed?: string[];
  showMacStatusBarIcon?: boolean;
  showWindowsTrayIcon?: boolean;
  pinnedSidebarApps?: string[];
  recentSidebarApps?: string[];
}): void {
  const current = loadSettings();
  if (prefs.language) current.general.language = prefs.language as Language;
  if (prefs.themeMode) current.general.themeMode = prefs.themeMode as ThemeMode;
  if (prefs.accentColor) current.general.accentColor = prefs.accentColor;
  if (prefs.showConflictAlerts !== undefined) current.general.showConflictAlerts = prefs.showConflictAlerts;
  if (prefs.monitoringShowAverage !== undefined) current.general.monitoringShowAverage = prefs.monitoringShowAverage;
  if (prefs.monitoringDetailedCollapsed !== undefined) current.general.monitoringDetailedCollapsed = prefs.monitoringDetailedCollapsed;
  if (prefs.showMacStatusBarIcon !== undefined) current.general.showMacStatusBarIcon = prefs.showMacStatusBarIcon;
  if (prefs.showWindowsTrayIcon !== undefined) current.general.showWindowsTrayIcon = prefs.showWindowsTrayIcon;
  if (prefs.pinnedSidebarApps !== undefined) current.general.pinnedSidebarApps = prefs.pinnedSidebarApps;
  if (prefs.recentSidebarApps !== undefined) current.general.recentSidebarApps = prefs.recentSidebarApps;
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

// Last applied accent - kept in-module so applyThemeMode() can re-derive
// shades when the user flips dark ↔ light without needing the caller to
// thread the accent through.
let currentAccent = DEFAULT_ACCENT;

// Match the --bg-elevated chrome tokens in src/styles/variables.scss (the top
// bar is what sits under the URL bar). Kept in sync manually so the iOS Safari
// URL bar / overscroll area painted via the theme-color meta matches the
// chrome the user actually sees at the top edge.
const THEME_COLOR_DARK = '#0f0f0f';
const THEME_COLOR_LIGHT = '#ecedf4';

/**
 * Set the html `data-theme` attribute and the iOS Safari / Chrome address-bar
 * color so the browser chrome (URL bar, overscroll, scrollbars) matches the
 * page background. Caller passes an already-resolved 'dark' | 'light' value;
 * use applyThemeMode if you have a raw ThemeMode (incl. 'system'/'auto').
 *
 * Separate from applyThemeMode so surfaces with independent theme state
 * (e.g. the phone panel) update html chrome without touching the desktop
 * accent.
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

/**
 * Apply the dashboard background style by toggling `data-bg` on <html> (CSS
 * reads it for the flat base color) and notifying <AppBackdrop> via a window
 * event so it can swap the rendered layer (ribbons / none).
 */
export function applyBackgroundMode(mode: BackgroundMode): void {
  document.documentElement.setAttribute('data-bg', mode);
  window.dispatchEvent(new CustomEvent('nexus:bg-mode', { detail: mode }));
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
 * foreground - returns true if black text reads better than white on this
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
 * grayscale in both modes - only the accent highlights follow the user's
 * hue. The SCSS fallbacks in variables.scss are the canonical values.
 */
export function deriveAccentVars(hex: string, mode: 'dark' | 'light' = 'dark'): Record<string, string> {
  const safe = normalizeAccent(hex);
  const { h, s, l } = hexToHsl(safe);

  // --accent is the user's pick verbatim. No saturation floor, no lightness clamp.
  // Glow / deep variants still derive from a bounded base so extreme picks
  // (near-black, near-white) don't collapse into unusable shades.
  const baseS = clamp(Math.max(s, 55));
  const baseL = mode === 'dark' ? clamp(l, 50, 66) : clamp(l, 40, 54);
  const glowL = mode === 'dark' ? clamp(baseL + 10, 58, 80) : clamp(baseL + 8, 48, 68);
  const deepL = mode === 'dark' ? clamp(baseL - 16, 22, 50) : clamp(baseL - 20, 14, 40);
  const deepS = clamp(baseS + 5);
  const softAlpha       = mode === 'dark' ? 0.14 : 0.12;
  const glowShadowAlpha = mode === 'dark' ? 0.45 : 0.35;
  return {
    '--accent':             hslCss(h, s, l),
    '--accent-glow':        hslCss(h, baseS, glowL),
    '--accent-deep':        hslCss(h, deepS, deepL),
    '--accent-soft':        hslCss(h, s, l, softAlpha),
    '--accent-glow-shadow': hslCss(h, s, l, glowShadowAlpha),
    '--accent-text':        needsDarkTextOnHsl(h, s, l) ? '#000000' : '#ffffff',
  };
}

export function applyAccentColor(hex: string): void {
  const safe = normalizeAccent(hex);
  currentAccent = safe;

  const effective = document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark';
  const { h, s, l } = hexToHsl(safe);

  // --accent is the user's pick verbatim. No saturation floor, no lightness clamp.
  // Glow / deep variants still derive from a bounded base so extreme picks
  // (near-black, near-white) don't collapse into unusable shades.
  const baseS = clamp(Math.max(s, 55));
  const baseL = effective === 'dark' ? clamp(l, 50, 66) : clamp(l, 40, 54);
  const glowL = effective === 'dark' ? clamp(baseL + 10, 58, 80) : clamp(baseL + 8, 48, 68);
  const deepL = effective === 'dark' ? clamp(baseL - 16, 22, 50) : clamp(baseL - 20, 14, 40);
  const deepS = clamp(baseS + 5);

  const softAlpha       = effective === 'dark' ? 0.14 : 0.12;
  const glowShadowAlpha = effective === 'dark' ? 0.45 : 0.35;

  // Pick black-or-white text for the accent surface based on its luminance.
  // Keeps text legible across the full hue range - dark picks keep white text;
  // bright yellows/limes/cyans flip to black.
  const accentText = needsDarkTextOnHsl(h, s, l)             ? '#000000' : '#ffffff';

  const root = document.documentElement.style;
  root.setProperty('--accent',             hslCss(h, s, l));
  root.setProperty('--accent-glow',        hslCss(h, baseS, glowL));
  root.setProperty('--accent-deep',        hslCss(h, deepS, deepL));
  root.setProperty('--accent-soft',        hslCss(h, s, l, softAlpha));
  root.setProperty('--accent-glow-shadow', hslCss(h, s, l, glowShadowAlpha));
  root.setProperty('--accent-text',        accentText);
  // Muted accent for a slider's "capped" fill zone; follows the accent hue.
  // hslCss (not color-mix) so it stays valid inside the track gradient on the
  // Chromium-83 Q60 panel.
  const dimS = clamp(baseS * 0.7);
  const dimL = effective === 'dark' ? clamp(glowL * 0.6, 26, 46) : clamp(glowL + 10, 62, 84);
  root.setProperty('--slider-fill-dim',    hslCss(h, dimS, dimL));
}

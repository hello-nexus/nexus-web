import { Moon, Sun, Monitor, Smartphone, Palette, SunMoon } from 'lucide-react';
import { NAV_ICONS } from '../app/sidebarNav';
import { LANGUAGES, LANGUAGE_LABELS } from '../lib/settings';
import type { CommandContext, SearchEntry, SearchProvider } from './types';
import styles from './CommandPalette.module.scss';

// ── Navigation ─────────────────────────────────────────────────────────────
const NAV_VIEWS: { view: string; labelKey: string; keywords: string[] }[] = [
  { view: 'dashboard',  labelKey: 'nav.dashboard',  keywords: ['home', 'overview', 'start'] },
  { view: 'monitoring', labelKey: 'nav.monitoring', keywords: ['cpu', 'gpu', 'temps', 'sensors', 'usage', 'performance', 'network', 'ram', 'memory'] },
  { view: 'lighting',   labelKey: 'lighting.title', keywords: ['rgb', 'led', 'leds', 'effects', 'color', 'colour'] },
  { view: 'cooling',    labelKey: 'cooling.title',  keywords: ['fans', 'fan curve', 'pump', 'thermals', 'temps'] },
  { view: 'devices',    labelKey: 'devices.title',  keywords: ['usb', 'peripherals', 'hardware', 'connected'] },
  { view: 'settings',   labelKey: 'settings.title', keywords: ['preferences', 'config', 'options', 'setup'] },
];

const navigationProvider: SearchProvider = {
  id: 'navigation',
  entries: (ctx): SearchEntry[] =>
    NAV_VIEWS.map(({ view, labelKey, keywords }) => ({
      id: `nav:${view}`,
      title: ctx.t(labelKey),
      group: 'navigate',
      icon: NAV_ICONS[view],
      keywords,
      run: () => ctx.host.goView(view),
    })),
};

// ── Settings sub-tabs ──────────────────────────────────────────────────────
const SETTINGS_TABS: { tab: string; labelKey: string; keywords: string[] }[] = [
  { tab: 'general',  labelKey: 'settings.general',     keywords: ['startup', 'tray', 'login', 'language'] },
  { tab: 'theme',    labelKey: 'settings.theme',       keywords: ['appearance', 'dark', 'light', 'accent', 'color'] },
  { tab: 'profiles', labelKey: 'settings.tab.profiles', keywords: ['profile', 'preset', 'switch'] },
  { tab: 'tools',    labelKey: 'settings.tab.tools',   keywords: ['developer', 'debug', 'advanced'] },
];

const settingsProvider: SearchProvider = {
  id: 'settings',
  entries: (ctx): SearchEntry[] =>
    SETTINGS_TABS.map(({ tab, labelKey, keywords }) => ({
      id: `settings:${tab}`,
      title: `${ctx.t('settings.title')} › ${ctx.t(labelKey)}`,
      group: 'settings',
      icon: NAV_ICONS.settings,
      keywords,
      run: () => ctx.host.goView('settings', tab),
    })),
};

// ── Connected devices ──────────────────────────────────────────────────────
const devicesProvider: SearchProvider = {
  id: 'devices',
  entries: (ctx): SearchEntry[] =>
    ctx.devices.map((d) => ({
      id: `device:${d.key}`,
      title: d.name,
      subtitle: d.subtitle,
      group: 'devices',
      icon: <img className={styles.deviceIcon} src={d.iconSrc} alt="" aria-hidden />,
      keywords: ['device', d.subtitle],
      run: () => ctx.host.goView('device', d.key),
    })),
};

// ── Appearance (live toggles) ──────────────────────────────────────────────
const ACCENTS: { name: string; hex: string }[] = [
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Sky', hex: '#3b82f6' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Green', hex: '#16c963' },
  { name: 'Teal', hex: '#0bbfa9' },
  { name: 'Cyan', hex: '#06b6d4' },
];

// English endonyms keyed by code, so "spanish" finds Español. Order matches LANGUAGES.
const LANG_EN: Record<string, string> = {
  en: 'English', 'zh-TW': 'Chinese Traditional', 'zh-CN': 'Chinese Simplified',
  ja: 'Japanese', ko: 'Korean', de: 'German', fr: 'French', es: 'Spanish',
  it: 'Italian', pt: 'Portuguese', 'pt-BR': 'Portuguese Brazil', ru: 'Russian',
  tr: 'Turkish', pl: 'Polish',
};

const appearanceProvider: SearchProvider = {
  id: 'appearance',
  entries: (ctx): SearchEntry[] => {
    const active = ctx.t('search.hint.active');
    const out: SearchEntry[] = [
      {
        id: 'appearance:theme-dark', title: ctx.t('search.appearance.themeDark'), group: 'appearance',
        icon: <Moon size={18} />, keywords: ['theme', 'dark', 'night', 'mode', 'appearance'],
        hint: ctx.settings.themeMode === 'dark' ? active : undefined, keepOpen: true,
        run: () => ctx.updateSettings({ themeMode: 'dark' }),
      },
      {
        id: 'appearance:theme-light', title: ctx.t('search.appearance.themeLight'), group: 'appearance',
        icon: <Sun size={18} />, keywords: ['theme', 'light', 'day', 'mode', 'appearance'],
        hint: ctx.settings.themeMode === 'light' ? active : undefined, keepOpen: true,
        run: () => ctx.updateSettings({ themeMode: 'light' }),
      },
      {
        id: 'appearance:theme-system', title: ctx.t('search.appearance.themeSystem'), group: 'appearance',
        icon: <Monitor size={18} />, keywords: ['theme', 'system', 'auto', 'mode', 'appearance'],
        hint: ctx.settings.themeMode === 'system' ? active : undefined, keepOpen: true,
        run: () => ctx.updateSettings({ themeMode: 'system' }),
      },
    ];
    for (const { name, hex } of ACCENTS) {
      const isActive = ctx.settings.accentColor.toLowerCase() === hex.toLowerCase();
      out.push({
        id: `appearance:accent-${hex}`,
        title: ctx.t('search.appearance.accent', { name }),
        group: 'appearance',
        icon: <span className={styles.accentDot} style={{ background: hex }} aria-hidden />,
        keywords: ['accent', 'color', 'colour', 'theme', name],
        hint: isActive ? active : undefined, keepOpen: true,
        run: () => ctx.updateSettings({ accentColor: hex }),
      });
    }
    for (const lang of LANGUAGES) {
      const isActive = ctx.settings.language === lang;
      out.push({
        id: `appearance:lang-${lang}`,
        title: ctx.t('search.appearance.language', { name: LANGUAGE_LABELS[lang] }),
        group: 'appearance',
        icon: <Palette size={18} className={styles.langGlyph} />,
        keywords: ['language', 'locale', 'translation', LANG_EN[lang] ?? lang, LANGUAGE_LABELS[lang]],
        hint: isActive ? active : undefined, keepOpen: true,
        run: () => ctx.updateSettings({ language: lang }),
      });
    }
    return out;
  },
};

// ── Actions ────────────────────────────────────────────────────────────────
const actionsProvider: SearchProvider = {
  id: 'actions',
  entries: (ctx): SearchEntry[] => [
    {
      id: 'action:pair-phone', title: ctx.t('search.action.pairPhone'), group: 'actions',
      icon: <Smartphone size={18} />, keywords: ['phone', 'pair', 'qr', 'mobile', 'remote', 'connect'],
      run: () => ctx.host.pairPhone(),
    },
    {
      id: 'action:toggle-theme', title: ctx.t('search.action.toggleTheme'), group: 'actions',
      icon: <SunMoon size={18} />, keywords: ['theme', 'dark', 'light', 'toggle', 'switch'], keepOpen: true,
      run: () => ctx.updateSettings({ themeMode: ctx.settings.themeMode === 'light' ? 'dark' : 'light' }),
    },
  ],
};

export const PROVIDERS: SearchProvider[] = [
  navigationProvider,
  settingsProvider,
  devicesProvider,
  appearanceProvider,
  actionsProvider,
];

/** Flatten every provider's entries for the current context. */
export function buildEntries(ctx: CommandContext): SearchEntry[] {
  return PROVIDERS.flatMap((p) => p.entries(ctx));
}

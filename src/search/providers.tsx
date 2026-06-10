import type { ReactNode } from 'react';
import { Moon, Sun, Monitor, Smartphone, Palette, Power, MonitorUp, Film, Sparkles, Wifi, Cloud, RadioTower, SlidersHorizontal, UserRound } from 'lucide-react';
import { NAV_ICONS } from '../app/sidebarNav';
import { LANGUAGES, LANGUAGE_LABELS, PRESET_ACCENTS, type ThemeMode } from '../lib/settings';
import { applyProfile } from '../api/cooling';
import { setPanelRemoteControlEnabled, setPanelRelay, setPanelPairBroadcast } from '../api/panel';
import { startAnimate, stopLighting, startScreenMirror } from '../api/lighting';
import { COOLING_PRESETS, type CoolingPresetKey } from '../panel/widgets/cooling/page/coolingPresets';
import { EFFECTS, MODES, BASE_DEFAULTS, categoryOf, type LightingMode } from '../types/lighting';
import type { CommandContext, SearchEntry, SearchSource } from './types';
import styles from './TopSearch.module.scss';

// ── Entry factories ─────────────────────────────────────────────────────────
// Two shapes, so a source declares only what matters and the kind/plumbing is
// filled in. `go` opens a page (commits nothing); `act` applies immediately.
function go(id: string, e: {
  title: string; to: () => void;
  icon?: ReactNode; subtitle?: string; keywords?: string[]; suggest?: boolean;
}): SearchEntry {
  return { id, kind: 'navigate', title: e.title, run: e.to, icon: e.icon, subtitle: e.subtitle, keywords: e.keywords, suggest: e.suggest };
}
function act(id: string, e: {
  title: string; run: () => void;
  icon?: ReactNode; subtitle?: string; keywords?: string[]; hint?: string;
}): SearchEntry {
  return { id, kind: 'action', title: e.title, run: e.run, icon: e.icon, subtitle: e.subtitle, keywords: e.keywords, hint: e.hint };
}

// A boolean on/off control as ONE entry: the row renders a switch in the
// current state and selecting it flips. Universal for every two-state option
// (remote/relay/Wi-Fi, settings toggles) — never a separate On + Off pair. Also
// matches the opposite verb ("relay off" finds it while it's on).
function toggleEntry(id: string, e: {
  label: string; icon: ReactNode; keywords: string[]; isOn: boolean; set: (next: boolean) => void;
}): SearchEntry {
  return {
    id, kind: 'action', title: e.label, icon: e.icon,
    keywords: [...e.keywords, 'toggle', e.isOn ? 'off' : 'on', e.isOn ? 'disable' : 'enable'],
    toggle: e.isOn,
    setToggle: e.set,
    run: () => e.set(!e.isOn),
  };
}

// ── Data tables ─────────────────────────────────────────────────────────────
// Edit these to add results. Anything bigger (effects, modes, presets, devices)
// is read straight from its own source-of-truth list, so it never drifts.

const NAV: { view: string; labelKey: string; keywords: string[] }[] = [
  { view: 'dashboard',  labelKey: 'nav.dashboard',  keywords: ['home', 'overview', 'start'] },
  { view: 'monitoring', labelKey: 'nav.monitoring', keywords: ['cpu', 'gpu', 'temps', 'sensors', 'usage', 'performance', 'network', 'ram', 'memory'] },
  // Cooling/lighting keywords include their actions' terms so the page-open
  // pairs with the direct actions (search "silent" or "mirror" → preset/mode
  // action + the page to see more).
  { view: 'lighting',   labelKey: 'lighting.title', keywords: ['rgb', 'led', 'leds', 'effects', 'color', 'colour', 'animation', 'effect', 'mirror', 'media', 'brightness', 'off'] },
  { view: 'cooling',    labelKey: 'cooling.title',  keywords: ['fans', 'fan curve', 'pump', 'thermals', 'temps', 'preset', 'profile', 'silent', 'balanced', 'turbo', 'custom', 'curve', 'off'] },
  { view: 'devices',    labelKey: 'devices.title',  keywords: ['usb', 'peripherals', 'hardware', 'connected'] },
  { view: 'settings',   labelKey: 'settings.title', keywords: ['preferences', 'config', 'options', 'setup'] },
];

// Displays is the Devices page's second tab, so its search hit deep-links
// with the subtab (same pattern as the settings tabs below).
const navDisplays: SearchSource = (ctx) => [go('nav:displays', {
  title: `${ctx.t('devices.title')} › ${ctx.t('displays.title')}`,
  icon: NAV_ICONS.devices,
  keywords: ['monitor', 'screen', 'display', 'panel', 'second screen', 'multi'],
  suggest: true,
  to: () => ctx.host.goView('devices', 'displays'),
})];

const SETTINGS_TABS: { tab: string; labelKey: string; keywords: string[] }[] = [
  { tab: 'general',  labelKey: 'settings.general',      keywords: ['startup', 'tray', 'login', 'language'] },
  { tab: 'theme',    labelKey: 'settings.theme',        keywords: ['appearance', 'dark', 'light', 'accent', 'color'] },
  { tab: 'profiles', labelKey: 'settings.tab.profiles', keywords: ['profile', 'preset', 'switch'] },
  { tab: 'tools',    labelKey: 'settings.tab.tools',    keywords: ['developer', 'debug', 'advanced'] },
];

// Individual settings, indexed by their real label so "tray" finds the actual
// "Show icon in tray" toggle, not just the tab. Each opens the hosting tab.
const SETTINGS_ITEMS: { tab: string; tabLabelKey: string; labelKey: string; keywords: string[] }[] = [
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.windowsTray.label',  keywords: ['tray', 'system tray', 'notification area', 'taskbar', 'icon', 'windows'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.macStatusBar.label',  keywords: ['menu bar', 'status bar', 'menubar', 'macos', 'mac', 'icon'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.systemStartup.label', keywords: ['startup', 'boot', 'login', 'autostart', 'auto start', 'launch', 'start with windows'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.alerts.label',        keywords: ['conflict', 'warnings', 'alerts', 'notifications'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.language',            keywords: ['language', 'locale', 'translation'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.screentime.title',    keywords: ['screen time', 'tracking', 'usage', 'data'] },
  { tab: 'theme',   tabLabelKey: 'settings.theme',   labelKey: 'settings.accent',              keywords: ['accent', 'color', 'colour', 'highlight'] },
];

const THEMES: { mode: ThemeMode; labelKey: string; icon: ReactNode; words: string[] }[] = [
  { mode: 'dark',   labelKey: 'settings.theme.dark',   icon: <Moon size={18} />,    words: ['dark', 'night'] },
  { mode: 'light',  labelKey: 'settings.theme.light',  icon: <Sun size={18} />,     words: ['light', 'day'] },
  { mode: 'system', labelKey: 'settings.theme.system', icon: <Monitor size={18} />, words: ['system', 'auto'] },
];

// Colors + order come from the canonical PRESET_ACCENTS (lib/settings.ts); this
// is only display names for nicer titles + name search. An unnamed hex labels
// itself, so changing the palette only means editing PRESET_ACCENTS.
const ACCENT_NAMES: Record<string, string> = {
  '#2563eb': 'Blue', '#3b82f6': 'Sky', '#8b5cf6': 'Violet', '#ec4899': 'Pink', '#ef4444': 'Red',
  '#f97316': 'Orange', '#f59e0b': 'Amber', '#16c963': 'Green', '#0bbfa9': 'Teal', '#06b6d4': 'Cyan',
  '#3e63b8': 'Soft blue', '#5a85c6': 'Soft sky', '#8e83c0': 'Soft violet', '#b96b94': 'Soft pink', '#bf6363': 'Soft red',
  '#bd7958': 'Soft orange', '#bd8d42': 'Soft amber', '#5fa07e': 'Soft green', '#509995': 'Soft teal', '#4f9aab': 'Soft cyan',
};

// English endonyms keyed by code, so "spanish" finds Español.
const LANG_EN: Record<string, string> = {
  en: 'English', 'zh-TW': 'Chinese Traditional', 'zh-CN': 'Chinese Simplified', ja: 'Japanese', ko: 'Korean',
  de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', 'pt-BR': 'Portuguese Brazil',
  ru: 'Russian', tr: 'Turkish', pl: 'Polish',
};

// Lighting modes, keyed by the canonical MODES. `apply` present → runs now;
// absent → opens the lighting page (Media needs a file; Animation is the effect
// family, each listed individually below).
const MODE_POLICY: Record<LightingMode, { icon: ReactNode; keywords: string[]; apply?: () => void }> = {
  none:    { icon: <Power size={18} />,     keywords: ['off', 'stop', 'disable'],                   apply: () => { void stopLighting().catch(() => {}); } },
  screen:  { icon: <MonitorUp size={18} />, keywords: ['mirror', 'screen', 'ambient', 'ambilight'], apply: () => { void startScreenMirror().catch(() => {}); } },
  gif:     { icon: <Film size={18} />,      keywords: ['media', 'gif', 'video', 'image'] },
  animate: { icon: <Sparkles size={18} />,  keywords: ['animation', 'animate', 'effects'] },
};

// Cooling presets that need the page rather than a blind apply (custom = your
// editable curve). Everything else applies via applyProfile.
const COOLING_NAVIGATE: ReadonlySet<CoolingPresetKey> = new Set(['custom']);

// ── Sources ─────────────────────────────────────────────────────────────────
const navigation: SearchSource = (ctx) =>
  NAV.map((n) => go(`nav:${n.view}`, {
    title: ctx.t(n.labelKey), icon: NAV_ICONS[n.view], keywords: n.keywords, suggest: true,
    to: () => ctx.host.goView(n.view),
  }));

const settingsTabs: SearchSource = (ctx) =>
  SETTINGS_TABS.map((s) => go(`settings:${s.tab}`, {
    title: `${ctx.t('settings.title')} › ${ctx.t(s.labelKey)}`, icon: NAV_ICONS.settings, keywords: s.keywords,
    to: () => ctx.host.goView('settings', s.tab),
  }));

const settingsItems: SearchSource = (ctx) =>
  SETTINGS_ITEMS.map((s) => go(`setting:${s.labelKey}`, {
    title: ctx.t(s.labelKey), subtitle: `${ctx.t('settings.title')} › ${ctx.t(s.tabLabelKey)}`,
    icon: NAV_ICONS.settings, keywords: s.keywords,
    to: () => ctx.host.goView('settings', s.tab),
  }));

const devices: SearchSource = (ctx) =>
  ctx.devices.map((d) => go(`device:${d.key}`, {
    title: d.name, keywords: ['device'],
    icon: <img className={styles.deviceIcon} src={d.iconSrc} alt="" aria-hidden />,
    to: () => ctx.host.goView('device', d.key),
  }));

const cooling: SearchSource = (ctx) => {
  if (!ctx.online) return [];
  return COOLING_PRESETS.map(({ key, i18nKey, Icon }) => {
    const opts = { title: `${ctx.t('cooling.title')} · ${ctx.t(i18nKey)}`, icon: <Icon size={18} />, keywords: ['cooling', 'fan', 'fans', 'preset', 'profile', 'mode', key] };
    return COOLING_NAVIGATE.has(key)
      ? go(`cooling:${key}`, { ...opts, to: () => ctx.host.goView('cooling') })
      : act(`cooling:${key}`, { ...opts, run: () => { void applyProfile(key).catch(() => {}); } });
  });
};

const lightingModes: SearchSource = (ctx) => {
  if (!ctx.online) return [];
  return MODES.map((m) => {
    const p = MODE_POLICY[m.key];
    const opts = { title: `${ctx.t('lighting.title')} · ${ctx.t(m.labelKey)}`, icon: p.icon, keywords: ['lighting', 'rgb', 'led', m.key, ...p.keywords] };
    return p.apply
      ? act(`lighting-mode:${m.key}`, { ...opts, run: p.apply })
      : go(`lighting-mode:${m.key}`, { ...opts, to: () => ctx.host.goView('lighting') });
  });
};

// Match effects on their name, "animation"/"animate"/"effect", the key, or
// category — deliberately not on "lighting"/"rgb" so those keep surfacing the
// page + modes instead of being flooded by ~60 effects.
const lightingEffects: SearchSource = (ctx) => {
  if (!ctx.online) return [];
  const animation = ctx.t('lighting.mode.animate');
  const { speed, intensity, hue, colorize, saturation, contrast } = BASE_DEFAULTS;
  return EFFECTS.map((e) => {
    const params = Object.fromEntries(e.params.map((p) => [p.name, p.defaultValue]));
    return act(`effect:${e.key}`, {
      title: ctx.t(e.labelKey), subtitle: animation, icon: <Sparkles size={18} />,
      keywords: ['animation', 'animate', 'animated', 'effect', e.key, categoryOf(e.key)],
      run: () => { void startAnimate(e.key, speed, intensity, hue, colorize, saturation, contrast, params).catch(() => {}); },
    });
  });
};

// Live appearance toggles. Titles compose from existing localized keys so an
// Italian user sees "Tema · Scuro"; English keywords stay for cross-language match.
const appearance: SearchSource = (ctx) => {
  const active = ctx.t('search.hint.active');
  const out = THEMES.map(({ mode, labelKey, icon, words }) => act(`appearance:theme-${mode}`, {
    title: `${ctx.t('settings.theme')} · ${ctx.t(labelKey)}`, icon, keywords: ['theme', 'mode', 'appearance', ...words],
    hint: ctx.settings.themeMode === mode ? active : undefined,
    run: () => ctx.updateSettings({ themeMode: mode }),
  }));
  for (const hex of PRESET_ACCENTS) {
    const name = ACCENT_NAMES[hex] ?? hex;
    out.push(act(`appearance:accent-${hex}`, {
      title: `${ctx.t('settings.accent')} · ${name}`,
      icon: <span className={styles.accentDot} style={{ background: hex }} aria-hidden />,
      keywords: ['accent', 'color', 'colour', 'theme', name],
      hint: ctx.settings.accentColor.toLowerCase() === hex.toLowerCase() ? active : undefined,
      run: () => ctx.updateSettings({ accentColor: hex }),
    }));
  }
  for (const lang of LANGUAGES) {
    out.push(act(`appearance:lang-${lang}`, {
      title: `${ctx.t('settings.language')} · ${LANGUAGE_LABELS[lang]}`,
      icon: <Palette size={18} className={styles.langGlyph} />,
      keywords: ['language', 'locale', 'translation', LANG_EN[lang] ?? lang, LANGUAGE_LABELS[lang]],
      hint: ctx.settings.language === lang ? active : undefined,
      run: () => ctx.updateSettings({ language: lang }),
    }));
  }
  return out;
};

// The pairing modal is the "open" half for remote/relay/Wi-Fi — it hosts all
// those controls — so it carries their keywords too.
const actions: SearchSource = (ctx) => [
  go('open:pairing', {
    title: ctx.t('phonePair.title'), icon: <Smartphone size={18} />,
    keywords: ['phone', 'pair', 'pairing', 'qr', 'code', 'mobile', 'remote', 'relay', 'cloud', 'wifi', 'wi-fi', 'connect'],
    to: () => ctx.host.pairPhone(),
  }),
];

// Remote-access controls — single toggles reflecting live state, alongside the
// pairing-modal open above (the "see more" half). Real panel wires; gated online.
const remoteAccess: SearchSource = (ctx) => {
  if (!ctx.online) return [];
  return [
    toggleEntry('toggle:remote', {
      label: ctx.t('phonePair.killswitch.label'), icon: <RadioTower size={18} />,
      keywords: ['remote', 'control', 'relay', 'pair', 'access'],
      isOn: ctx.panel.remoteEnabled, set: (en) => { void setPanelRemoteControlEnabled(en).catch(() => {}); },
    }),
    toggleEntry('toggle:relay', {
      label: ctx.t('phonePair.relay.label'), icon: <Cloud size={18} />,
      keywords: ['relay', 'cloud', 'internet', 'remote'],
      isOn: ctx.panel.relayEnabled, set: (en) => { void setPanelRelay(en).catch(() => {}); },
    }),
    toggleEntry('toggle:wifi', {
      label: ctx.t('search.wifi.label'), icon: <Wifi size={18} />,
      keywords: ['wifi', 'wi-fi', 'discover', 'find', 'airdrop', 'network', 'pair'],
      isOn: ctx.panel.wifiEnabled, set: (en) => { void setPanelPairBroadcast(en ? 'always' : 'never').catch(() => {}); },
    }),
  ];
};

// Boolean settings as single toggles (the action half), paired with the
// settings-item entries above that open the tab. Generic over UiSettingsValue.
const TOGGLES: { id: string; labelKey: string; field: 'showWindowsTrayIcon' | 'showMacStatusBarIcon' | 'disableConflictAlerts'; words: string[] }[] = [
  { id: 'tray',    labelKey: 'settings.windowsTray.label',  field: 'showWindowsTrayIcon', words: ['tray', 'icon', 'windows', 'taskbar', 'notification area'] },
  { id: 'menubar', labelKey: 'settings.macStatusBar.label', field: 'showMacStatusBarIcon', words: ['menu bar', 'status bar', 'macos', 'mac', 'icon'] },
  { id: 'alerts',  labelKey: 'settings.alerts.label',       field: 'disableConflictAlerts', words: ['conflict', 'alerts', 'warnings', 'notifications'] },
];
const settingsToggles: SearchSource = (ctx) =>
  TOGGLES.map(({ id, labelKey, field, words }) => toggleEntry(`toggle:${id}`, {
    label: ctx.t(labelKey), icon: <SlidersHorizontal size={18} />, keywords: ['setting', ...words],
    isOn: ctx.settings[field], set: (en) => ctx.updateSettings({ [field]: en } as Partial<typeof ctx.settings>),
  }));

// Switch the active profile directly; "Settings › Profiles" is the open half.
const profilesSource: SearchSource = (ctx) => {
  if (!ctx.online) return [];
  return ctx.profiles.map((p) => act(`profile:${p.id}`, {
    title: `${ctx.t('settings.tab.profiles')} · ${p.name}`,
    icon: <UserRound size={18} />,
    keywords: ['profile', 'preset', 'switch', p.name],
    hint: p.id === ctx.activeProfileId ? ctx.t('search.hint.active') : undefined,
    run: () => ctx.switchProfile(p.id),
  }));
};

// ── Registry ────────────────────────────────────────────────────────────────
// Add a source here to add a category of results. Order is cosmetic — entries
// are ranked by relevance, not source order.
export const SOURCES: SearchSource[] = [
  navigation, navDisplays, settingsTabs, settingsItems, devices, profilesSource,
  cooling, lightingModes, lightingEffects, appearance,
  actions, remoteAccess, settingsToggles,
];

/** Every source's entries for the current context, flattened. */
export function buildEntries(ctx: CommandContext): SearchEntry[] {
  return SOURCES.flatMap((s) => s(ctx));
}

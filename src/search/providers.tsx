import type { ReactNode } from 'react';
import {
  Moon, Sun, Monitor, Smartphone, Palette, Power, MonitorUp, Film, Sparkles, Wifi, Cloud, RadioTower,
  SlidersHorizontal, UserRound, FlaskConical, Gamepad2, Bug, FolderOpen, Info, MessageCircle, RefreshCw,
  Music, Lightbulb, VolumeX, Play, SkipForward, SkipBack, Lock, LayoutGrid, AppWindow, Crosshair,
  ScrollText, Wrench, Download, Upload, Plus, Disc, Radio, Mic, Headphones,
} from 'lucide-react';
import { NAV_ICONS } from '../app/sidebarNav';
import {
  LANGUAGES, LANGUAGE_LABELS, PRESET_ACCENTS, BACKGROUND_MODES,
  type ThemeMode, type BackgroundMode,
} from '../lib/settings';
import { hostSupportsGlass } from '../app/windowActions';
import { applyProfile } from '../api/cooling';
import { setPanelRemoteControlEnabled, setPanelRelay, setPanelPairBroadcast } from '../api/panel';
import {
  startAnimate, stopLighting, startScreenMirror, startGameSync,
  setMusicReactive, setGlobalBrightness, setLightingDevicePower, identifyLightingDevice,
  rescanLightingDevices, reselectScreen, triggerGameSyncScan,
} from '../api/lighting';
import { setBrandEnabled, setSmartLightEnabled } from '../api/smartLights';
import { setTrackingEnabled } from '../hooks/useScreenTimeBrowse';
import { controlActiveMedia } from '../hooks/useMedia';
import { setSystemMuted, systemPower } from '../api/system';
import { toggleObsRecording, toggleObsStreaming } from '../api/obs';
import { setDiscordMute, setDiscordDeaf } from '../api/discord';
import { syncCloudNow } from '../api/cloud';
import { OFFICIAL_BUILD } from '../lib/officialBuild';
import { exportProfile } from '../api/profiles';
import {
  openDiagnosticsEventViewer, openDiagnosticsDeviceManager, downloadDiagnosticsReport,
} from '../api/diagnostics';
import { postService } from '../api/service';
import type { UpdateMode, UpdateChannel } from '../api/update';
import { COOLING_MODES, type CoolingModeKey } from '../panel/widgets/cooling/page/coolingModes';
import { EFFECTS, MODES, BASE_DEFAULTS, categoryOf, type LightingMode } from '../types/lighting';
import { appAvailableForSurface, getCatalogEntries } from '../panel/widgets/registry';
import { preinstalledIconUrl } from '../app/sidebarApps';
import { AppIconImage } from '../components/icons/AppIconImage';
import { DEV_TOOLS } from '../lib/devTools';
import { DISCORD_INVITE_URL, GITHUB_ISSUES_URL } from '../lib/externalLinks';
import type { CommandContext, SearchEntry, SearchSource } from './types';
import { requestSearchScroll } from './scroll';
import { fireSearchSignal } from './signals';
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
// (remote/relay/Wi-Fi, settings toggles) - never a separate On + Off pair. Also
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
  { view: 'dashboard',  labelKey: 'sidebar.section.apps',  keywords: ['home', 'overview', 'start', 'dashboard', 'store', 'apps'] },
  { view: 'monitoring', labelKey: 'nav.monitoring', keywords: ['cpu', 'gpu', 'temps', 'sensors', 'usage', 'performance', 'network', 'ram', 'memory'] },
  { view: 'screentime', labelKey: 'screentime.title', keywords: ['screen time', 'usage', 'apps', 'tracking', 'pickups', 'history'] },
  // Cooling/lighting keywords include their actions' terms so the page-open
  // pairs with the direct actions (search "silent" or "mirror" → preset/mode
  // action + the page to see more).
  { view: 'lighting',   labelKey: 'lighting.title', keywords: ['rgb', 'led', 'leds', 'effects', 'color', 'colour', 'animation', 'effect', 'mirror', 'media', 'brightness', 'off'] },
  { view: 'cooling',    labelKey: 'cooling.title',  keywords: ['fans', 'fan curve', 'pump', 'thermals', 'temps', 'preset', 'profile', 'silent', 'balanced', 'turbo', 'custom', 'curve', 'off'] },
  { view: 'devices',    labelKey: 'devices.title',  keywords: ['usb', 'peripherals', 'hardware', 'connected'] },
  { view: 'settings',   labelKey: 'settings.title', keywords: ['preferences', 'config', 'options', 'setup', 'settings', 'update', 'updates', 'software update'] },
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

// Every routed subtab, titled "Page › Tab" from the tab's own label key so it
// deep-links exactly where the page's tab strip would land. Displays has its
// curated entry above; the diagnostics view lives behind `app:diagnostics`.
// `official` limits a row to a build carrying the credential, the same way
// `platforms` limits SETTINGS_ITEMS to the hosts that render them.
const SUBTABS: { view: string; sub: string; viewLabelKey: string; labelKey: string; keywords: string[]; official?: boolean }[] = [
  { view: 'monitoring', sub: 'cpu',      viewLabelKey: 'nav.monitoring', labelKey: 'monitoring.tab.cpu',      keywords: ['cpu', 'processor', 'cores', 'usage'] },
  { view: 'monitoring', sub: 'gpu',      viewLabelKey: 'nav.monitoring', labelKey: 'monitoring.tab.gpu',      keywords: ['gpu', 'graphics', 'vram', 'usage'] },
  { view: 'monitoring', sub: 'memory',   viewLabelKey: 'nav.monitoring', labelKey: 'monitoring.tab.memory',   keywords: ['ram', 'memory', 'usage'] },
  { view: 'monitoring', sub: 'storage',  viewLabelKey: 'nav.monitoring', labelKey: 'monitoring.tab.storage',  keywords: ['storage', 'disk', 'drive', 'read', 'write', 'i/o'] },
  { view: 'monitoring', sub: 'network',  viewLabelKey: 'nav.monitoring', labelKey: 'monitoring.tab.network',  keywords: ['network', 'ethernet', 'wifi', 'bandwidth', 'speed'] },
  { view: 'monitoring', sub: 'detailed', viewLabelKey: 'nav.monitoring', labelKey: 'monitoring.tab.detailed', keywords: ['sensors', 'detailed', 'all sensors', 'list'] },
  { view: 'screentime', sub: 'day',      viewLabelKey: 'screentime.title', labelKey: 'screentime.tab.day',    keywords: ['today', 'daily', 'screen time'] },
  { view: 'screentime', sub: 'week',     viewLabelKey: 'screentime.title', labelKey: 'screentime.tab.week',   keywords: ['weekly', 'screen time'] },
  { view: 'screentime', sub: 'month',    viewLabelKey: 'screentime.title', labelKey: 'screentime.tab.month',  keywords: ['monthly', 'screen time'] },
  { view: 'screentime', sub: 'app',      viewLabelKey: 'screentime.title', labelKey: 'screentime.tab.app',    keywords: ['per app', 'app usage', 'screen time'] },
  { view: 'benchmark',  sub: 'run',          viewLabelKey: 'benchmark.title', labelKey: 'benchmark.tab.run',          keywords: ['benchmark', 'test', 'score', 'fps'] },
  { view: 'benchmark',  sub: 'results',      viewLabelKey: 'benchmark.title', labelKey: 'benchmark.tab.results',      keywords: ['benchmark', 'history', 'scores'] },
  { view: 'benchmark',  sub: 'leaderboards', viewLabelKey: 'benchmark.title', labelKey: 'benchmark.tab.leaderboards', keywords: ['benchmark', 'leaderboard', 'ranking', 'compare'], official: true },
  { view: 'devices',    sub: 'firmware', viewLabelKey: 'devices.title', labelKey: 'devices.tabs.firmware', keywords: ['firmware', 'flash', 'fw', 'update'] },
  { view: 'devices',    sub: 'specs',    viewLabelKey: 'devices.title', labelKey: 'devices.tabs.specs',    keywords: ['specs', 'specifications', 'system info', 'hardware info'] },
  { view: 'diagnostics', sub: 'storage', viewLabelKey: 'diagnostics.title', labelKey: 'diagnostics.kind.storage', keywords: ['disk', 'ssd', 'nvme', 'smart', 'health', 'storage'] },
  // Memory-test scheduling stays on this tab behind its own confirm (it arms
  // a reboot-time diagnostic), so the subtab is the palette's way in.
  { view: 'diagnostics', sub: 'memory',  viewLabelKey: 'diagnostics.title', labelKey: 'diagnostics.kind.memory',  keywords: ['ram', 'memory', 'memtest', 'memory test', 'health'] },
  { view: 'diagnostics', sub: 'cooling', viewLabelKey: 'diagnostics.title', labelKey: 'diagnostics.kind.cooling', keywords: ['thermals', 'temperature', 'throttle', 'health'] },
  { view: 'diagnostics', sub: 'system',  viewLabelKey: 'diagnostics.title', labelKey: 'diagnostics.kind.system',  keywords: ['drivers', 'devices', 'events', 'health'] },
  { view: 'diagnostics', sub: 'settings', viewLabelKey: 'diagnostics.title', labelKey: 'diagnostics.tab.settings', keywords: ['thresholds', 'notifications', 'alerts'] },
];
const navSubtabs: SearchSource = (ctx) =>
  SUBTABS.filter((s) => !s.official || OFFICIAL_BUILD).map((s) => go(`nav:${s.view}/${s.sub}`, {
    title: `${ctx.t(s.viewLabelKey)} › ${ctx.t(s.labelKey)}`,
    icon: NAV_ICONS[s.view] ?? <LayoutGrid size={18} />,
    keywords: s.keywords,
    to: () => ctx.host.goView(s.view, s.sub),
  }));

// Settings is 5 top tabs; these all deep-link to the Settings page and select
// the owning tab (the `to:` handler below passes `tab` as the subtab).
// Profiles and Dev tools moved to their own pages - see `standalonePages`.
const SETTINGS_TABS: { tab: string; labelKey: string; keywords: string[] }[] = [
  { tab: 'general',          labelKey: 'settings.general',               keywords: ['startup', 'tray', 'login', 'language', 'updates', 'diagnostics', 'danger', 'reset'] },
  { tab: 'appearance',       labelKey: 'settings.tab.appearance',        keywords: ['theme', 'dark', 'light', 'accent', 'color', 'time', 'number', 'format'] },
  { tab: 'lighting-cooling', labelKey: 'settings.lightingCooling.title', keywords: ['lighting', 'cooling', 'rgb', 'led', 'fans', 'render gpu', 'sleep blackout'] },
  { tab: 'monitoring',       labelKey: 'settings.tab.monitoringDiagnostics', keywords: ['temperature', 'celsius', 'fahrenheit', 'sensors', 'diagnostics', 'health'] },
  { tab: 'privacy',          labelKey: 'settings.tab.privacyData',       keywords: ['telemetry', 'screen time', 'data', 'ai'] },
];

// Individual settings, indexed by their real label so "tray" finds the actual
// "Show icon in tray" toggle, not just the tab. `anchor` is the id stamped on
// the matching control (via SettingRow's anchorId), so selecting one navigates
// to Settings, selects the owning tab, and scrolls to + shines that exact row.
// `platforms` limits a row to the hosts whose Settings page renders it, so
// "tray" on macOS doesn't offer a scroll target that isn't there.
const SETTINGS_ITEMS: { tab: string; tabLabelKey: string; labelKey: string; anchor: string; keywords: string[]; platforms?: string[]; official?: boolean }[] = [
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.windowsTray.label',  anchor: 'set-tray',       keywords: ['tray', 'system tray', 'notification area', 'taskbar', 'icon', 'windows'], platforms: ['windows'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.macStatusBar.label',  anchor: 'set-menubar',    keywords: ['menu bar', 'status bar', 'menubar', 'macos', 'mac', 'icon'], platforms: ['macos'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.systemStartup.label', anchor: 'set-startup',    keywords: ['startup', 'boot', 'systemd', 'login', 'autostart', 'auto start', 'launch', 'start with windows'], platforms: ['windows', 'linux'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.startupDelay.label',  anchor: 'set-startup-delay', keywords: ['startup', 'delay', 'boot', 'autostart', 'auto start', 'launch delay', 'wait'], platforms: ['windows'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.rememberLastPage.label', anchor: 'set-remember-page', keywords: ['remember', 'last page', 'restore', 'reopen', 'resume', 'startup', 'tray'], platforms: ['windows', 'macos', 'linux'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.alerts.label',        anchor: 'set-alerts',     keywords: ['conflict', 'warnings', 'alerts', 'notifications'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.language',            anchor: 'set-language',   keywords: ['language', 'locale', 'translation'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.updates.mode.label',    anchor: 'set-update-mode',    keywords: ['update', 'updates', 'automatic', 'install', 'mode'], platforms: ['windows'], official: true },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.updates.channel.label', anchor: 'set-update-channel', keywords: ['update', 'updates', 'channel', 'beta', 'production'], platforms: ['windows'], official: true },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.shutDown.label',      anchor: 'set-shutdown',   keywords: ['shut down', 'shutdown', 'stop', 'quit', 'exit', 'close'], platforms: ['windows', 'macos', 'linux'] },
  { tab: 'general', tabLabelKey: 'settings.general', labelKey: 'settings.factoryReset.label',  anchor: 'set-factory-reset', keywords: ['factory reset', 'reset', 'wipe', 'erase', 'defaults', 'clean'] },
  { tab: 'appearance', tabLabelKey: 'settings.tab.appearance', labelKey: 'settings.accent',              anchor: 'set-accent',     keywords: ['accent', 'color', 'colour', 'highlight'] },
  { tab: 'appearance', tabLabelKey: 'settings.tab.appearance', labelKey: 'settings.theme',               anchor: 'set-theme-mode', keywords: ['theme', 'dark', 'light', 'appearance', 'mode'] },
  { tab: 'appearance', tabLabelKey: 'settings.tab.appearance', labelKey: 'settings.background',          anchor: 'set-background', keywords: ['background', 'glass', 'flat', 'gradient', 'transparency', 'blur'] },
  { tab: 'appearance', tabLabelKey: 'settings.tab.appearance', labelKey: 'settings.units.time.label',        anchor: 'set-time-format',  keywords: ['time', 'clock', '12 hour', '24 hour', 'am pm', 'format', 'units'] },
  { tab: 'appearance', tabLabelKey: 'settings.tab.appearance', labelKey: 'settings.units.number.label',      anchor: 'set-number-format', keywords: ['number', 'decimal', 'separator', 'comma', 'period', 'thousands', 'units', 'format'] },
  { tab: 'lighting-cooling', tabLabelKey: 'settings.lightingCooling.title', labelKey: 'settings.features.lighting.label', anchor: 'set-feature-lighting', keywords: ['lighting', 'rgb', 'led', 'on', 'off', 'switch', 'feature'] },
  { tab: 'lighting-cooling', tabLabelKey: 'settings.lightingCooling.title', labelKey: 'settings.features.cooling.label',  anchor: 'set-feature-cooling',  keywords: ['cooling', 'fans', 'on', 'off', 'switch', 'feature'] },
  { tab: 'lighting-cooling', tabLabelKey: 'settings.lightingCooling.title', labelKey: 'lighting.renderGpu.label',     anchor: 'set-render-gpu', keywords: ['render', 'gpu', 'shader', 'graphics card'], platforms: ['windows', 'linux'] },
  { tab: 'lighting-cooling', tabLabelKey: 'settings.lightingCooling.title', labelKey: 'lighting.sleepBlackout.label', anchor: 'set-sleep-blackout', keywords: ['sleep', 'suspend', 'standby', 'shutdown', 'power off', 'fade', 'leds', 'lights', 'off', 'ram', 'memory'], platforms: ['windows'] },
  { tab: 'lighting-cooling', tabLabelKey: 'settings.lightingCooling.title', labelKey: 'lighting.lockBlackout.label', anchor: 'set-lock-blackout', keywords: ['lock', 'locked', 'lock screen', 'away', 'afk', 'fade', 'dim', 'leds', 'lights', 'off'], platforms: ['windows', 'macos', 'linux'] },
  { tab: 'lighting-cooling', tabLabelKey: 'settings.lightingCooling.title', labelKey: 'cooling.settings.cpuLabel',    anchor: 'set-cpu-sensor', keywords: ['cpu', 'temp', 'temperature', 'sensor', 'source'] },
  { tab: 'lighting-cooling', tabLabelKey: 'settings.lightingCooling.title', labelKey: 'cooling.settings.gpuLabel',    anchor: 'set-gpu-sensor', keywords: ['gpu', 'temp', 'temperature', 'sensor', 'source'] },
  { tab: 'monitoring', tabLabelKey: 'settings.tab.monitoringDiagnostics', labelKey: 'settings.units.temperature.label', anchor: 'set-temp-unit',    keywords: ['temperature', 'celsius', 'fahrenheit', 'degrees', 'units', 'temp'] },
  { tab: 'monitoring', tabLabelKey: 'settings.tab.monitoringDiagnostics', labelKey: 'settings.features.monitoring.label',  anchor: 'set-feature-monitoring',  keywords: ['monitoring', 'history', 'on', 'off', 'switch', 'feature'] },
  { tab: 'monitoring', tabLabelKey: 'settings.tab.monitoringDiagnostics', labelKey: 'settings.features.diagnostics.label', anchor: 'set-feature-diagnostics', keywords: ['diagnostics', 'health', 'alerts', 'on', 'off', 'switch', 'feature'] },
  { tab: 'privacy', tabLabelKey: 'settings.tab.privacyData', labelKey: 'settings.screentime.title', anchor: 'set-screentime', keywords: ['screen time', 'tracking', 'usage', 'data'] },
  { tab: 'privacy', tabLabelKey: 'settings.tab.privacyData', labelKey: 'settings.telemetry.label',  anchor: 'set-telemetry',  keywords: ['telemetry', 'privacy', 'anonymous', 'data', 'consent'] },
  { tab: 'privacy', tabLabelKey: 'settings.tab.privacyData', labelKey: 'discord.presence.enable', anchor: 'set-discord-presence', keywords: ['discord', 'rich presence', 'status', 'profile', 'presence'] },
  { tab: 'privacy', tabLabelKey: 'settings.tab.privacyData', labelKey: 'settings.ai.master.label',     anchor: 'set-ai-integration', keywords: ['ai', 'mcp', 'model context protocol', 'assistant', 'agent', 'integration', 'token'] },
  { tab: 'privacy', tabLabelKey: 'settings.tab.privacyData', labelKey: 'nexus2Welcome.settingsEntry.rowLabel', anchor: 'set-nexus2-import', keywords: ['nexus 2', 'hyte', 'import', 'migration', 'personalization'] },
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
  de: 'German', nl: 'Dutch', fr: 'French', es: 'Spanish', it: 'Italian', pt: 'Portuguese', 'pt-BR': 'Portuguese Brazil',
  ru: 'Russian', tr: 'Turkish', pl: 'Polish', fur: 'Friulian',
};

// Lighting modes, keyed by the canonical MODES. `apply` present → runs now;
// absent → opens the lighting page (Media needs a file; Animation is the effect
// family, each listed individually below).
const MODE_POLICY: Record<LightingMode, { icon: ReactNode; keywords: string[]; apply?: () => void }> = {
  none:     { icon: <Power size={18} />,     keywords: ['off', 'stop', 'disable'],                   apply: () => { void stopLighting().catch(() => {}); } },
  screen:   { icon: <MonitorUp size={18} />, keywords: ['mirror', 'screen', 'ambient', 'ambilight'], apply: () => { void startScreenMirror().catch(() => {}); } },
  gif:      { icon: <Film size={18} />,      keywords: ['media', 'gif', 'video', 'image'] },
  static:   { icon: <Palette size={18} />,   keywords: ['static', 'solid', 'color', 'colour', 'fill', 'still', 'frozen'] },
  animate:  { icon: <Sparkles size={18} />,  keywords: ['animation', 'animate', 'effects'] },
  gamesync: { icon: <Gamepad2 size={18} />,  keywords: ['game', 'sync', 'chroma', 'razer', 'rgb'],   apply: () => { void startGameSync().catch(() => {}); } },
};

// Cooling presets that need the page rather than a blind apply (custom = your
// editable curve). Everything else applies via applyProfile.
const COOLING_NAVIGATE: ReadonlySet<CoolingModeKey> = new Set(['custom']);

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
  SETTINGS_ITEMS
    .filter((s) => !s.platforms || s.platforms.includes(ctx.platform))
    .filter((s) => !s.official || OFFICIAL_BUILD)
    .map((s) => go(`setting:${s.labelKey}`, {
      title: ctx.t(s.labelKey), subtitle: `${ctx.t('settings.title')} › ${ctx.t(s.tabLabelKey)}`,
      icon: NAV_ICONS.settings, keywords: s.keywords,
      to: () => { ctx.host.goView('settings', s.tab); requestSearchScroll(s.anchor); },
    }));

// Standalone pages that used to be Settings tabs: Profiles (top-bar profile
// menu) and Dev tools (top-bar "..." menu). Indexed here so search still
// reaches them.
const standalonePages: SearchSource = (ctx) => [
  go('page:profiles', {
    title: ctx.t('settings.tab.profiles'), icon: <UserRound size={18} />,
    keywords: ['profile', 'profiles', 'preset', 'switch', 'manage'],
    to: () => ctx.host.goView('profiles'),
  }),
  ...(DEV_TOOLS ? [go('page:tools', {
    title: ctx.t('settings.tab.tools'), icon: <FlaskConical size={18} />,
    keywords: ['developer', 'dev tools', 'debug', 'advanced', 'storybook', 'diagnostics'],
    to: () => ctx.host.goView('tools'),
  })] : []),
  ...(DEV_TOOLS && OFFICIAL_BUILD ? [go('page:account', {
    title: ctx.t('account.title'), icon: <UserRound size={18} />,
    keywords: ['account', 'sign in', 'login', 'log in', 'register', 'cloud', 'sync', 'password', 'sign out', 'log out'],
    to: () => ctx.host.goView('account'),
  })] : []),
];

// Every installed app that ships a page - built-ins plus installed marketplace
// (SDK) apps. Widget placement on the dashboard is irrelevant: an app has one
// page, listed whenever its manifest carries a `Page`. Apps already surfaced by
// the curated NAV rows above (their page-open carries hand-tuned keywords paired
// with the cooling/lighting action entries) are skipped so they list once.
const CURATED_APP_VIEWS = new Set(NAV.map((n) => n.view));

// Hand-tuned synonyms per app, so "hue" finds Smart Lights and "leaderboard"
// finds Benchmark. Apps absent here still match on their localized title.
const APP_KEYWORDS: Record<string, string[]> = {
  clock: ['time', 'timezone', 'world clock'],
  calendar: ['events', 'schedule', 'agenda', 'date'],
  gallery: ['photos', 'images', 'pictures', 'slideshow', 'wallpaper'],
  steam: ['games', 'game library', 'launch', 'valve', 'playtime'],
  'smart-lights': ['hue', 'govee', 'philips', 'bulb', 'smart', 'lamp'],
  'home-assistant': ['hass', 'home automation', 'smart home', 'entities', 'iot'],
  benchmark: ['leaderboard', 'leaderboards', 'score', 'fps', 'stress test', 'performance test'],
  diagnostics: ['health', 'smart', 'memory test', 'troubleshoot', 'events', 'drivers'],
  media: ['music', 'player', 'spotify', 'now playing', 'playback'],
  weather: ['forecast', 'rain', 'outdoor', 'temperature'],
  stocks: ['market', 'shares', 'ticker', 'finance', 'portfolio'],
  obs: ['stream', 'record', 'studio', 'scenes', 'broadcast'],
  discord: ['voice', 'chat', 'call'],
  twitch: ['stream', 'chat', 'viewers', 'live'],
  deck: ['macros', 'buttons', 'stream deck', 'shortcuts', 'launcher'],
  displays: ['monitors', 'screens', 'panels'],
  timer: ['countdown', 'alarm'],
  stopwatch: ['laps', 'timing'],
  calculator: ['math', 'arithmetic'],
  emoji: ['emotes', 'reactions'],
};

const installedApps: SearchSource = (ctx) =>
  getCatalogEntries()
    .filter(([type, m]) => !!m.Page && !CURATED_APP_VIEWS.has(type))
    .map(([type, m]) => {
      const Icon = m.meta.icon;
      // A preinstalled (OEM) app renders its own manifest mark, same as the
      // sidebar; every other app falls back to the generic catalog glyph.
      const iconUrl = preinstalledIconUrl(type);
      return go(`app:${type}`, {
        title: ctx.t(m.meta.i18nKey),
        icon: iconUrl ? <AppIconImage src={iconUrl} size={18} /> : <Icon size={18} />,
        keywords: ['app', ...(APP_KEYWORDS[type] ?? [])],
        to: () => ctx.host.goView(type),
      });
    });

// Widget-only apps (no page) open the dashboard's add-widget catalog, so
// searching "weather" lands somewhere useful instead of nowhere. The catalog
// itself is the picker; the signal survives the navigation.
const widgetApps: SearchSource = (ctx) =>
  getCatalogEntries()
    // Same delisting AND surface gate as the widget catalog itself, so search
    // never offers an "Add widget" whose picker won't show the app. The
    // navigation lands on the dashboard, so desktop is the surface to test.
    .filter(([, m]) => !m.Page
      && appAvailableForSurface(m.meta, 'desktop')
      && (DEV_TOOLS || m.meta.listed !== false))
    .map(([type, m]) => {
      const Icon = m.meta.icon;
      return go(`widget:${type}`, {
        title: ctx.t(m.meta.i18nKey),
        subtitle: ctx.t('devices.y70.editor.addWidget'),
        icon: <Icon size={18} />,
        keywords: ['widget', 'app', 'add', ...(APP_KEYWORDS[type] ?? [])],
        to: () => { ctx.host.goView('dashboard'); fireSearchSignal('add-widget'); },
      });
    });

const devices: SearchSource = (ctx) =>
  ctx.devices.map((d) => ({
    ...go(`device:${d.key}`, {
      title: d.name, keywords: ['device'],
      icon: <img className={styles.deviceIcon} src={d.iconSrc} alt="" aria-hidden />,
      to: () => ctx.host.goView('device', d.key),
    }),
    // An unplugged device stays findable; the hint says why it looks idle.
    hint: d.connected ? undefined : ctx.t('search.hint.disconnected'),
  }));

const cooling: SearchSource = (ctx) => {
  if (!ctx.online) return [];
  return COOLING_MODES.map(({ key, i18nKey, Icon }) => {
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
// category - deliberately not on "lighting"/"rgb" so those keep surfacing the
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
  // Background style, minus glass where the host can't composite it - the
  // same gate the Settings picker applies.
  const backgroundModes: readonly BackgroundMode[] = hostSupportsGlass()
    ? BACKGROUND_MODES
    : BACKGROUND_MODES.filter((m) => m !== 'glass');
  for (const mode of backgroundModes) {
    out.push(act(`appearance:background-${mode}`, {
      title: `${ctx.t('settings.background')} · ${ctx.t(`settings.background.${mode}`)}`,
      icon: <Monitor size={18} />,
      keywords: ['background', 'appearance', 'style', mode, 'glass', 'transparency'],
      hint: ctx.settings.backgroundMode === mode ? active : undefined,
      run: () => ctx.updateSettings({ backgroundMode: mode }),
    }));
  }
  return out;
};

// The pairing modal is the "open" half for remote/relay/Wi-Fi - it hosts all
// those controls - so it carries their keywords too.
const actions: SearchSource = (ctx) => [
  go('open:pairing', {
    title: ctx.t('phonePair.title'), icon: <Smartphone size={18} />,
    keywords: ['phone', 'pair', 'pairing', 'qr', 'code', 'mobile', 'remote', 'relay', 'cloud', 'wifi', 'wi-fi', 'connect'],
    to: () => ctx.host.pairPhone(),
  }),
];

// Remote-access controls - single toggles reflecting live state, alongside the
// pairing-modal open above (the "see more" half). Real panel wires; gated online.
const remoteAccess: SearchSource = (ctx) => {
  if (!ctx.online) return [];
  return [
    toggleEntry('toggle:remote', {
      label: ctx.t('phonePair.killswitch.label'), icon: <RadioTower size={18} />,
      keywords: ['remote', 'control', 'relay', 'pair', 'access'],
      isOn: ctx.panel.remoteEnabled, set: (en) => { void setPanelRemoteControlEnabled(en).catch(() => {}); },
    }),
    ...(OFFICIAL_BUILD ? [toggleEntry('toggle:relay', {
      label: ctx.t('phonePair.relay.label'), icon: <Cloud size={18} />,
      keywords: ['relay', 'cloud', 'internet', 'remote'],
      isOn: ctx.panel.relayEnabled, set: (en) => { void setPanelRelay(en).catch(() => {}); },
    })] : []),
    toggleEntry('toggle:wifi', {
      label: ctx.t('search.wifi.label'), icon: <Wifi size={18} />,
      keywords: ['wifi', 'wi-fi', 'discover', 'find', 'airdrop', 'network', 'pair'],
      isOn: ctx.panel.wifiEnabled, set: (en) => { void setPanelPairBroadcast(en ? 'always' : 'never').catch(() => {}); },
    }),
  ];
};

// Boolean settings as single toggles (the action half), paired with the
// settings-item entries above that open the tab. Generic over UiSettingsValue.
const TOGGLES: { id: string; labelKey: string; field: 'showWindowsTrayIcon' | 'showMacStatusBarIcon' | 'showConflictAlerts'; words: string[]; platforms?: string[] }[] = [
  { id: 'tray',    labelKey: 'settings.windowsTray.label',  field: 'showWindowsTrayIcon', words: ['tray', 'icon', 'windows', 'taskbar', 'notification area'], platforms: ['windows'] },
  { id: 'menubar', labelKey: 'settings.macStatusBar.label', field: 'showMacStatusBarIcon', words: ['menu bar', 'status bar', 'macos', 'mac', 'icon'], platforms: ['macos'] },
  { id: 'alerts',  labelKey: 'settings.alerts.label',       field: 'showConflictAlerts', words: ['conflict', 'alerts', 'warnings', 'notifications'] },
];
const settingsToggles: SearchSource = (ctx) =>
  TOGGLES
    .filter(({ platforms }) => !platforms || platforms.includes(ctx.platform))
    .map(({ id, labelKey, field, words }) => toggleEntry(`toggle:${id}`, {
      label: ctx.t(labelKey), icon: <SlidersHorizontal size={18} />, keywords: ['setting', ...words],
      isOn: ctx.settings[field], set: (en) => ctx.updateSettings({ [field]: en } as Partial<typeof ctx.settings>),
    }));

// Switch the active profile directly; the Profiles page is the open half.
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

// Manage-profiles one-shots. Create needs a name prompt so it opens the page;
// the destructive ones (delete, reset) stay on the page behind their confirms.
const profilesExtra: SearchSource = (ctx) => {
  const out: SearchEntry[] = [
    go('profiles:create', {
      title: ctx.t('profile.create'), subtitle: ctx.t('settings.tab.profiles'),
      icon: <Plus size={18} />,
      keywords: ['profile', 'create', 'new', 'add'],
      to: () => ctx.host.goView('profiles'),
    }),
  ];
  const activeProfile = ctx.profiles.find((p) => p.id === ctx.activeProfileId);
  if (ctx.online && activeProfile) {
    out.push(act('profiles:export', {
      title: `${ctx.t('profile.export')} · ${activeProfile.name}`,
      subtitle: ctx.t('settings.tab.profiles'), icon: <Upload size={18} />,
      keywords: ['profile', 'export', 'backup', 'save', 'json'],
      run: () => { void exportProfile(activeProfile.id, activeProfile.name); },
    }));
  }
  return out;
};

// One-keystroke opens for chrome that otherwise hides in menus and page
// headers. Cross-page opens navigate first; the signal survives the mount.
const quickOpens: SearchSource = (ctx) => [
  ...(OFFICIAL_BUILD ? [go('open:check-updates', {
    title: ctx.t('update.menu.check'), icon: <RefreshCw size={18} />,
    keywords: ['update', 'updates', 'upgrade', 'version', 'check', 'install', 'new version'],
    to: () => fireSearchSignal('update-modal'),
  })] : []),
  go('open:about', {
    title: ctx.t('nav.about'), icon: <Info size={18} />,
    keywords: ['about', 'version', 'info', 'credits'],
    to: () => fireSearchSignal('about'),
  }),
  go('open:discord-invite', {
    title: ctx.t('nav.discord'), icon: <MessageCircle size={18} />,
    keywords: ['discord', 'community', 'chat', 'help', 'support', 'invite'],
    to: () => { window.open(DISCORD_INVITE_URL, '_blank', 'noopener,noreferrer'); },
  }),
  go('open:add-widget', {
    title: ctx.t('devices.y70.editor.addWidget'), icon: <LayoutGrid size={18} />,
    keywords: ['widget', 'add', 'catalog', 'apps', 'install', 'dashboard', 'edit'],
    to: () => { ctx.host.goView('dashboard'); fireSearchSignal('add-widget'); },
  }),
  go('open:desktop-widgets', {
    title: ctx.t('dashboard.desktopWidgets'), icon: <AppWindow size={18} />,
    keywords: ['desktop', 'widgets', 'overlay', 'floating'],
    to: () => { ctx.host.goView('dashboard'); fireSearchSignal('desktop-widgets'); },
  }),
  go('open:connected-devices', {
    title: ctx.t('devices.connected.browse'), icon: NAV_ICONS.devices,
    keywords: ['connected', 'devices', 'usb', 'plugged in'],
    to: () => { ctx.host.goView('devices'); fireSearchSignal('devices-connected'); },
  }),
  go('open:supported-devices', {
    title: ctx.t('devices.supported.browse'), icon: NAV_ICONS.devices,
    keywords: ['supported', 'devices', 'compatibility', 'compatible', 'hardware'],
    to: () => { ctx.host.goView('devices'); fireSearchSignal('devices-supported'); },
  }),
];

// Update preferences as direct actions; their Settings rows are the open half.
const UPDATE_MODES: UpdateMode[] = ['always', 'download', 'notify'];
const UPDATE_CHANNELS: UpdateChannel[] = ['production', 'beta'];
const updatePrefs: SearchSource = (ctx) => {
  if (ctx.platform !== 'windows' || !OFFICIAL_BUILD) return [];
  const active = ctx.t('search.hint.active');
  return [
    ...UPDATE_MODES.map((mode) => act(`update-mode:${mode}`, {
      title: `${ctx.t('settings.updates.mode.label')} · ${ctx.t(`settings.updates.mode.${mode}`)}`,
      icon: <Download size={18} />,
      keywords: ['update', 'updates', 'automatic', 'mode', mode],
      hint: ctx.settings.updateMode === mode ? active : undefined,
      run: () => ctx.updateSettings({ updateMode: mode }),
    })),
    ...UPDATE_CHANNELS.map((ch) => act(`update-channel:${ch}`, {
      title: `${ctx.t('settings.updates.channel.label')} · ${ctx.t(`settings.updates.channel.${ch}`)}`,
      icon: <Download size={18} />,
      keywords: ['update', 'updates', 'channel', ch],
      hint: ctx.settings.updateChannel === ch ? active : undefined,
      run: () => ctx.updateSettings({ updateChannel: ch }),
    })),
  ];
};

// Server-authoritative privacy switches, present only when their state
// actually loaded (telemetry hides on surfaces that can't reach consent).
const privacyToggles: SearchSource = (ctx) => {
  const out: SearchEntry[] = [];
  if (ctx.live.telemetry !== null) {
    out.push(toggleEntry('toggle:telemetry', {
      label: ctx.t('settings.telemetry.label'), icon: <SlidersHorizontal size={18} />,
      keywords: ['telemetry', 'privacy', 'anonymous', 'analytics', 'data', 'setting'],
      isOn: ctx.live.telemetry, set: (en) => { void postService('/telemetry/consent', { enabled: en }).catch(() => {}); },
    }));
  }
  if (ctx.live.tracking !== null) {
    out.push(toggleEntry('toggle:screentime-tracking', {
      label: ctx.t('settings.screentime.tracking'), icon: <SlidersHorizontal size={18} />,
      keywords: ['screen time', 'tracking', 'usage', 'privacy', 'setting'],
      isOn: ctx.live.tracking, set: (en) => { void setTrackingEnabled(en).catch(() => {}); },
    }));
  }
  return out;
};

// Lighting one-shots + the music-reactive modifier, alongside the modes above.
const BRIGHTNESS_STEPS = [25, 50, 75, 100];
const lightingExtras: SearchSource = (ctx) => {
  if (!ctx.online) return [];
  const out: SearchEntry[] = [];
  if (ctx.live.musicReactive !== null) {
    out.push(toggleEntry('toggle:music-reactive', {
      label: ctx.t('lighting.musicReactive'), icon: <Music size={18} />,
      keywords: ['music', 'audio', 'reactive', 'sound', 'beat', 'lighting', 'rgb'],
      isOn: ctx.live.musicReactive, set: (en) => { void setMusicReactive(en).catch(() => {}); },
    }));
  }
  const active = ctx.t('search.hint.active');
  const current = ctx.live.globalBrightness;
  for (const pct of BRIGHTNESS_STEPS) {
    out.push(act(`brightness:${pct}`, {
      title: `${ctx.t('lighting.devices.brightness')} · ${pct}%`,
      subtitle: ctx.t('lighting.title'), icon: <Sun size={18} />,
      keywords: ['brightness', 'bright', 'dim', 'lighting', 'rgb', String(pct)],
      hint: current !== null && Math.round(current * 100) === pct ? active : undefined,
      run: () => { void setGlobalBrightness(pct / 100).catch(() => {}); },
    }));
  }
  out.push(act('lighting:rescan', {
    title: ctx.t('lighting.devices.rescan'), subtitle: ctx.t('lighting.title'),
    icon: <RefreshCw size={18} />,
    keywords: ['rescan', 'refresh', 'detect', 'openrgb', 'devices'],
    run: () => { void rescanLightingDevices().catch(() => {}); },
  }));
  out.push(act('lighting:reselect-screen', {
    title: ctx.t('lighting.controls.changeScreen'), subtitle: ctx.t('lighting.mode.screen'),
    icon: <MonitorUp size={18} />,
    keywords: ['mirror', 'region', 'screen', 'area', 'monitor', 'change'],
    run: () => { void reselectScreen().catch(() => {}); },
  }));
  return out;
};

// Per-device lighting rows from the palette-open snapshot: a power switch and
// an identify flash for every zone card the lighting page shows.
const lightingDeviceActions: SearchSource = (ctx) => {
  if (!ctx.online || !ctx.live.lightingDevices) return [];
  return ctx.live.lightingDevices.flatMap((d) => [
    toggleEntry(`light-power:${d.id}`, {
      label: d.name, icon: <Lightbulb size={18} />,
      keywords: ['power', 'led', 'light', 'device', d.name],
      isOn: d.ledsOn, set: (en) => { void setLightingDevicePower(d.id, en).catch(() => {}); },
    }),
    act(`light-identify:${d.id}`, {
      title: `${ctx.t('lighting.devices.identify')} · ${d.name}`,
      subtitle: ctx.t('lighting.title'), icon: <Crosshair size={18} />,
      keywords: ['identify', 'find', 'locate', 'blink', 'flash', d.name],
      run: () => { void identifyLightingDevice(d.id).catch(() => {}); },
    }),
  ]);
};

// Smart-light brand enables + per-light switches, mirroring the page's rows.
const smartLightsSource: SearchSource = (ctx) => {
  if (!ctx.online || !ctx.live.smartLights) return [];
  const out: SearchEntry[] = [];
  for (const [brand, enabled] of Object.entries(ctx.live.smartLights.brandEnabled ?? {})) {
    const name = brand.charAt(0).toUpperCase() + brand.slice(1);
    out.push(toggleEntry(`smart-brand:${brand}`, {
      label: `${ctx.t('smartLights.title')} · ${name}`, icon: <Lightbulb size={18} />,
      keywords: ['smart', 'lights', 'brand', brand, 'bulb'],
      isOn: enabled, set: (en) => { void setBrandEnabled(brand, en).catch(() => {}); },
    }));
  }
  for (const light of ctx.live.smartLights.devices) {
    out.push(toggleEntry(`smart-light:${light.id}`, {
      label: light.name, icon: <Lightbulb size={18} />,
      keywords: ['smart', 'light', 'bulb', 'lamp', light.brand, light.name],
      isOn: light.enabled, set: (en) => { void setSmartLightEnabled(light.id, en).catch(() => {}); },
    }));
  }
  return out;
};

// Game Sync's installed-games rescan; the mode itself is in lightingModes.
const gameSyncScan: SearchSource = (ctx) => {
  if (!ctx.online || ctx.platform !== 'windows') return [];
  return [act('gamesync:scan', {
    title: `${ctx.t('lighting.mode.gamesync')} · ${ctx.t('lighting.gameSync.games.rescan')}`,
    icon: <Gamepad2 size={18} />,
    keywords: ['game', 'sync', 'scan', 'rescan', 'games', 'detect', 'steam'],
    run: () => { void triggerGameSyncScan().catch(() => {}); },
  })];
};

// OBS + Discord live controls, present only while the integration reports a
// state to flip (OBS connected; Discord in a voice channel).
const integrations: SearchSource = (ctx) => {
  const out: SearchEntry[] = [];
  const obs = ctx.live.obs;
  if (obs?.connected) {
    out.push(toggleEntry('obs:recording', {
      label: `OBS · ${ctx.t('panel.widget.obs.record')}`, icon: <Disc size={18} />,
      keywords: ['obs', 'record', 'recording', 'capture'],
      isOn: obs.recording, set: () => { void toggleObsRecording().catch(() => {}); },
    }));
    out.push(toggleEntry('obs:streaming', {
      label: `OBS · ${ctx.t('panel.widget.obs.stream')}`, icon: <Radio size={18} />,
      keywords: ['obs', 'stream', 'streaming', 'live', 'broadcast'],
      isOn: obs.streaming, set: () => { void toggleObsStreaming().catch(() => {}); },
    }));
  }
  const discord = ctx.live.discord;
  if (discord?.connected && discord.voiceState) {
    out.push(toggleEntry('discord:mute', {
      label: `Discord · ${ctx.t('discord.mute')}`, icon: <Mic size={18} />,
      keywords: ['discord', 'mute', 'microphone', 'mic', 'voice'],
      isOn: discord.voiceState.selfMute, set: (en) => { void setDiscordMute(en).catch(() => {}); },
    }));
    out.push(toggleEntry('discord:deafen', {
      label: `Discord · ${ctx.t('discord.deafen')}`, icon: <Headphones size={18} />,
      keywords: ['discord', 'deafen', 'deaf', 'audio', 'voice'],
      isOn: discord.voiceState.selfDeaf, set: (en) => { void setDiscordDeaf(en).catch(() => {}); },
    }));
  }
  return out;
};

// Host-machine controls: audio, the active media session, and (Windows) the
// lock/sleep power verbs the deck widget already drives.
const systemMedia: SearchSource = (ctx) => {
  if (!ctx.online) return [];
  const out: SearchEntry[] = [];
  if (ctx.live.volume?.supported) {
    out.push(toggleEntry('system:mute', {
      label: ctx.t('panel.settings.deck.system.muteToggle'), icon: <VolumeX size={18} />,
      keywords: ['mute', 'unmute', 'volume', 'sound', 'audio', 'silence'],
      isOn: ctx.live.volume.muted, set: (en) => { void setSystemMuted(en).catch(() => {}); },
    }));
    out.push(
      act('media:playpause', {
        title: ctx.t('panel.settings.deck.system.mediaPlayPause'), icon: <Play size={18} />,
        keywords: ['play', 'pause', 'music', 'media', 'song', 'resume'],
        run: () => { void controlActiveMedia('playpause').catch(() => {}); },
      }),
      act('media:next', {
        title: ctx.t('panel.settings.deck.system.mediaNext'), icon: <SkipForward size={18} />,
        keywords: ['next', 'skip', 'track', 'song', 'media', 'music'],
        run: () => { void controlActiveMedia('next').catch(() => {}); },
      }),
      act('media:previous', {
        title: ctx.t('panel.settings.deck.system.mediaPrev'), icon: <SkipBack size={18} />,
        keywords: ['previous', 'back', 'track', 'song', 'media', 'music'],
        run: () => { void controlActiveMedia('previous').catch(() => {}); },
      }),
    );
  }
  if (ctx.platform === 'windows') {
    out.push(
      act('system:lock', {
        title: ctx.t('panel.settings.deck.power.lock'), icon: <Lock size={18} />,
        keywords: ['lock', 'lock screen', 'lock pc', 'away'],
        run: () => { void systemPower('lock').catch(() => {}); },
      }),
      act('system:sleep', {
        title: ctx.t('panel.settings.deck.power.sleep'), icon: <Moon size={18} />,
        keywords: ['sleep', 'suspend', 'standby'],
        run: () => { void systemPower('sleep').catch(() => {}); },
      }),
    );
  }
  return out;
};

// Cloud account one-shots, dev-gated like the Account page. Sign-out opens
// the page (its flow also clears local tokens); sync-now is safe directly.
const accountExtra: SearchSource = (ctx) => {
  if (!DEV_TOOLS || !OFFICIAL_BUILD || !ctx.live.cloud?.activeAccountId) return [];
  return [
    act('account:sync-now', {
      title: ctx.t('account.sync.syncNow'), subtitle: ctx.t('account.title'),
      icon: <RefreshCw size={18} />,
      keywords: ['sync', 'cloud', 'account', 'profiles', 'upload'],
      run: () => { void syncCloudNow().catch(() => {}); },
    }),
    go('account:sign-out', {
      title: ctx.t('account.danger.logOut.label'), subtitle: ctx.t('account.title'),
      icon: <UserRound size={18} />,
      keywords: ['sign out', 'log out', 'logout', 'account'],
      to: () => ctx.host.goView('account'),
    }),
  ];
};

const diagnostics: SearchSource = (ctx) => [
  act('diag:open-logs', {
    title: ctx.t('settings.diagnostics.openLogsButton'),
    subtitle: ctx.t('settings.diagnostics.title'),
    icon: <FolderOpen size={18} />,
    keywords: ['logs', 'log', 'folder', 'diagnostics', 'debug', 'troubleshoot'],
    run: () => { void postService('/diagnostics/open-logs', {}).catch(() => {}); },
  }),
  act('diag:report-bug', {
    title: ctx.t('settings.feedback.report'),
    subtitle: ctx.t('settings.feedback'),
    icon: <Bug size={18} />,
    keywords: ['bug', 'report', 'feedback', 'issue', 'github', 'problem'],
    run: () => { window.open(GITHUB_ISSUES_URL, '_blank', 'noopener,noreferrer'); },
  }),
  ...(ctx.online ? [
    act('diag:download-report', {
      title: ctx.t('diagnostics.header.downloadReport'),
      subtitle: ctx.t('diagnostics.title'),
      icon: <Download size={18} />,
      keywords: ['diagnostics', 'report', 'bundle', 'export', 'download', 'support'],
      run: () => { void downloadDiagnosticsReport().catch(() => {}); },
    }),
  ] : []),
  ...(ctx.online && ctx.platform === 'windows' ? [
    act('diag:event-viewer', {
      title: ctx.t('diagnostics.incidents.openEventViewer'),
      subtitle: ctx.t('diagnostics.title'),
      icon: <ScrollText size={18} />,
      keywords: ['event', 'viewer', 'events', 'log', 'windows', 'incidents'],
      run: () => { void openDiagnosticsEventViewer().catch(() => {}); },
    }),
    act('diag:device-manager', {
      title: ctx.t('diagnostics.system.openDeviceManager'),
      subtitle: ctx.t('diagnostics.title'),
      icon: <Wrench size={18} />,
      keywords: ['device', 'manager', 'drivers', 'hardware', 'windows'],
      run: () => { void openDiagnosticsDeviceManager().catch(() => {}); },
    }),
  ] : []),
];

// ── Registry ────────────────────────────────────────────────────────────────
// Add a source here to add a category of results. Order is cosmetic - entries
// are ranked by relevance, not source order.
export const SOURCES: SearchSource[] = [
  navigation, navDisplays, navSubtabs, settingsTabs, settingsItems, standalonePages,
  installedApps, widgetApps, devices, profilesSource, profilesExtra,
  cooling, lightingModes, lightingEffects, lightingExtras, lightingDeviceActions,
  smartLightsSource, gameSyncScan, appearance, updatePrefs,
  actions, quickOpens, remoteAccess, settingsToggles, privacyToggles,
  integrations, systemMedia, accountExtra, diagnostics,
];

/** Every source's entries for the current context, flattened. */
export function buildEntries(ctx: CommandContext): SearchEntry[] {
  return SOURCES.flatMap((s) => s(ctx));
}

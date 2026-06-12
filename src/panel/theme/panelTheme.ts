import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { useTranslation } from '../../lib/i18n';
import {
  DEFAULT_ACCENT, LANGUAGES, THEME_MODES, deriveAccentVars, resolveTheme,
  type Language, type ThemeMode,
} from '../../lib/settings';
import { fetchPreferences } from '../../api/profiles';
import { fetchPanelDevice, patchPanelDevice, type PanelDevicePatch } from '../../api/panel';
import { broadcastLayoutChanged, onLayoutChanged } from '../engine/panelSync';
import {
  DEFAULT_PANEL_BACKGROUND_EFFECT,
  DEFAULT_PANEL_BACKGROUND_OPACITY,
  DEFAULT_PANEL_BACKGROUND_TEMPLATE,
  defaultPanelWidgetBlur,
  defaultPanelWidgetLabels,
  defaultPanelWidgetOpacity,
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundEffectState,
  normalizePanelBackgroundMode,
  normalizePanelBackgroundOpacity,
  normalizePanelBackgroundTemplate,
  normalizePanelWidgetBlur,
  normalizePanelWidgetLabels,
  normalizePanelWidgetOpacity,
  panelBackgroundPair,
  panelBackgroundState,
  type PanelBackgroundMode,
} from '../background/panelBackground';
import type { EffectState } from '../../types/lighting';
import type { PanelThemeSettingsState, ResolvedPanelThemeMode } from '../editor/PanelThemeSettings';

export type PanelThemeState = PanelThemeSettingsState;

export function normalizePanelThemeMode(value?: string | null): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode) ? value as ThemeMode : 'system';
}

export function normalizePanelDesktopSync(value?: boolean | null): boolean {
  return value !== false;
}

export function useResolvedPanelThemeMode(mode: ThemeMode): ResolvedPanelThemeMode {
  const [resolved, setResolved] = useState<ResolvedPanelThemeMode>(() => resolveTheme(mode));

  useEffect(() => {
    const update = () => setResolved(resolveTheme(mode));
    update();
    if (mode !== 'system' || typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    if (media.addEventListener) {
      media.addEventListener('change', update);
    } else {
      media.addListener(update);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', update);
      } else {
        media.removeListener(update);
      }
    };
  }, [mode]);

  return resolved;
}

export function useDocumentResolvedThemeMode(enabled: boolean): ResolvedPanelThemeMode {
  const readTheme = useCallback((): ResolvedPanelThemeMode => {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }, []);
  const [resolved, setResolved] = useState<ResolvedPanelThemeMode>(() => readTheme());

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    const update = () => setResolved(readTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [enabled, readTheme]);

  return resolved;
}

export function buildEmbeddedPanelThemeVars(appAccentColor: string | undefined, resolvedThemeMode: ResolvedPanelThemeMode): CSSProperties {
  const accentVars = deriveAccentVars(appAccentColor || DEFAULT_ACCENT, resolvedThemeMode);
  return {
    ...accentVars,
    '--panel-card-bg': 'var(--surface)',
    '--panel-card-bg-opacity': '100%',
    '--panel-accent': accentVars['--accent'],
    '--panel-accent-glow': accentVars['--accent-glow'],
    '--panel-accent-soft': accentVars['--accent-soft'],
    '--panel-accent-shadow': accentVars['--accent-glow-shadow'],
  } as CSSProperties;
}

export function buildPanelThemeVars(theme: PanelThemeState, resolvedThemeMode: ResolvedPanelThemeMode): CSSProperties {
  const accentColor = theme.accentSyncWithDesktop
    ? theme.appAccentColor
    : theme.accentColor || theme.appAccentColor;
  const accentVars = deriveAccentVars(accentColor || DEFAULT_ACCENT, resolvedThemeMode);
  // Widget surface alpha (user-controlled). .panel-card in tokens.scss applies
  // it via color-mix so only the background fades, not the contents.
  const widgetOpacityPct = Math.round(normalizePanelWidgetOpacity(theme.widgetOpacity) * 100);
  const vars: Record<string, string> = {
    ...accentVars,
    '--panel-card-bg': 'var(--surface)',
    '--panel-card-bg-opacity': `${widgetOpacityPct}%`,
    '--panel-accent': accentVars['--accent'],
    '--panel-accent-glow': accentVars['--accent-glow'],
    '--panel-accent-soft': accentVars['--accent-soft'],
    '--panel-accent-shadow': accentVars['--accent-glow-shadow'],
  };
  return vars as CSSProperties;
}

// Panel browsers (kiosk Edge, iOS WKWebView, other tabs) have their own
// localStorage; this fetch surfaces the desktop app's language choice.
// Mirrors usePanelTheme's fetch-and-apply shape.
export function usePanelLanguageSync(enabled = true) {
  const { language, setLanguage } = useTranslation();
  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);

  const syncLanguage = useCallback(() => {
    if (!enabled) return;
    fetchPreferences().then(prefs => {
      const next = prefs?.theme?.language;
      if (typeof next !== 'string') return;
      if (!(LANGUAGES as readonly string[]).includes(next)) return;
      if (next === languageRef.current) return;
      setLanguage(next as Language);
    }).catch(() => { /* keep current language */ });
  }, [enabled, setLanguage]);

  useEffect(() => {
    if (!enabled) return undefined;
    syncLanguage();
    return onLayoutChanged(syncLanguage);
  }, [enabled, syncLanguage]);
}

// Panel theme/visual settings are PER-PANEL on the device record
// (/panel/devices/{deviceId}), alongside the widget layout — NOT in shared
// `prefs.panel`. `deviceId` selects which panel's settings, so editing the Q60
// never touches the Y70. The only cross-surface link is the desktop app theme
// (`prefs.theme`), the sync source for theme-mode + accent when sync is on.
export function usePanelTheme(deviceId: string | null | undefined, enabled = true, persist = true) {
  const [theme, setTheme] = useState<PanelThemeState>({
    appThemeMode: 'system',
    appResolvedThemeMode: '',
    themeSyncWithDesktop: true,
    themeMode: 'system',
    appAccentColor: DEFAULT_ACCENT,
    accentSyncWithDesktop: true,
    accentColor: '',
    backgroundColor: '',
    backgroundColorLight: '',
    backgroundMode: 'solid',
    backgroundEffect: DEFAULT_PANEL_BACKGROUND_EFFECT,
    backgroundTemplate: DEFAULT_PANEL_BACKGROUND_TEMPLATE,
    backgroundOpacity: DEFAULT_PANEL_BACKGROUND_OPACITY,
    backgroundEffectState: panelBackgroundState(DEFAULT_PANEL_BACKGROUND_EFFECT, DEFAULT_PANEL_BACKGROUND_TEMPLATE),
    widgetOpacity: defaultPanelWidgetOpacity(),
    widgetLabels: defaultPanelWidgetLabels(),
    widgetBlur: defaultPanelWidgetBlur(),
  });
  const resolvedMode = useResolvedPanelThemeMode(
    // In sync mode prefer the desktop's *resolved* theme (concrete dark/light,
    // tracking the desktop OS). Fall back to appThemeMode when unpublished —
    // 'system' there would re-resolve against THIS device's OS (wrong OS).
    theme.themeSyncWithDesktop
      ? (theme.appResolvedThemeMode || theme.appThemeMode)
      : theme.themeMode,
  );
  const resolvedModeRef = useRef<ResolvedPanelThemeMode>(resolvedMode);
  useEffect(() => { resolvedModeRef.current = resolvedMode; }, [resolvedMode]);
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  const fetchTheme = useCallback(() => {
    if (!enabled) return;
    Promise.all([
      fetchPreferences(),
      deviceId ? fetchPanelDevice(deviceId).catch(() => null) : Promise.resolve(null),
    ]).then(([prefs, record]) => {
      // `t` = desktop app theme (sync source); `r` = this panel's per-device
      // theme. Absent record fields fall back to defaults via normalize*.
      const t = prefs?.theme;
      const r = record;
      setTheme({
        appThemeMode: normalizePanelThemeMode(t?.themeMode),
        appResolvedThemeMode: t?.resolvedThemeMode === 'dark' || t?.resolvedThemeMode === 'light'
          ? t.resolvedThemeMode : '',
        themeSyncWithDesktop: normalizePanelDesktopSync(r?.themeSyncWithDesktop),
        themeMode: normalizePanelThemeMode(r?.themeMode),
        appAccentColor: t?.accentColor || DEFAULT_ACCENT,
        accentSyncWithDesktop: normalizePanelDesktopSync(r?.accentSyncWithDesktop),
        accentColor: r?.accentColor ?? '',
        backgroundColor: r?.backgroundColor ?? '',
        backgroundColorLight: r?.backgroundColorLight ?? '',
        backgroundMode: normalizePanelBackgroundMode(r?.backgroundMode),
        backgroundEffect: normalizePanelBackgroundEffect(r?.backgroundEffect),
        backgroundTemplate: normalizePanelBackgroundTemplate(r?.backgroundTemplate),
        backgroundOpacity: normalizePanelBackgroundOpacity(r?.backgroundOpacity),
        backgroundEffectState: normalizePanelBackgroundEffectState(
          r?.backgroundEffectState,
          panelBackgroundState(
            normalizePanelBackgroundEffect(r?.backgroundEffect),
            normalizePanelBackgroundTemplate(r?.backgroundTemplate),
          ),
        ),
        widgetOpacity: normalizePanelWidgetOpacity(r?.widgetOpacity),
        widgetLabels: normalizePanelWidgetLabels(r?.widgetLabels),
        widgetBlur: normalizePanelWidgetBlur(r?.widgetBlur),
      });
    }).catch(() => { /* keep local theme */ });
  }, [enabled, deviceId]);

  useEffect(() => {
    if (!enabled) return undefined;
    fetchTheme();
    return onLayoutChanged(fetchTheme);
  }, [enabled, fetchTheme]);
  // Desktop app-theme push (the sync source) re-runs the fetch...
  useTopicCallback('prefs', enabled, fetchTheme);
  // ...as does a change to THIS panel's own device record (e.g. the dashboard
  // editor patching the theme while the kiosk is live). Filter to our id.
  useTopicCallback('panel/device', enabled, (raw) => {
    const frame = raw as { deviceId?: string } | null;
    if (frame?.deviceId === deviceId) fetchTheme();
  });

  // `persist=false` (e.g. simulator) or a missing deviceId keeps changes
  // local-only (preview reacts, no write). Writes go to THIS panel's device
  // record only.
  const persistPatch = useCallback((patch: PanelDevicePatch) => {
    if (!persist || !deviceId) return;
    patchPanelDevice(deviceId, patch)
      .then(() => broadcastLayoutChanged())
      .catch(() => {});
  }, [persist, deviceId]);

  const commitThemeSync = useCallback((synced: boolean) => {
    setTheme(prev => ({ ...prev, themeSyncWithDesktop: synced }));
    persistPatch({ themeSyncWithDesktop: synced });
  }, [persistPatch]);

  const commitThemeMode = useCallback((mode: ThemeMode) => {
    const nextMode = normalizePanelThemeMode(mode);
    setTheme(prev => ({ ...prev, themeMode: nextMode }));
    persistPatch({ themeMode: nextMode });
  }, [persistPatch]);

  const commitAccentSync = useCallback((synced: boolean) => {
    const current = themeRef.current;
    const nextAccent = !synced && !current.accentColor
      ? current.appAccentColor || DEFAULT_ACCENT
      : current.accentColor;
    setTheme(prev => ({
      ...prev,
      accentSyncWithDesktop: synced,
      accentColor: !synced && !prev.accentColor ? prev.appAccentColor || DEFAULT_ACCENT : prev.accentColor,
    }));
    persistPatch({
      accentSyncWithDesktop: synced,
      ...(!synced ? { accentColor: nextAccent || DEFAULT_ACCENT } : {}),
    });
  }, [persistPatch]);

  const commitAccent = useCallback((hex: string) => {
    setTheme(prev => ({ ...prev, accentColor: hex }));
    persistPatch({ accentColor: hex });
  }, [persistPatch]);

  const commitBackground = useCallback((hex: string) => {
    // Set both slots from the same column so dark/light stay in the picked hue
    // family; custom hex uses the same value for both (no counterpart).
    const { dark, light } = panelBackgroundPair(hex);
    setTheme(prev => ({ ...prev, backgroundColor: dark, backgroundColorLight: light }));
    persistPatch({ backgroundColor: dark, backgroundColorLight: light });
  }, [persistPatch]);

  const commitBackgroundMode = useCallback((mode: PanelBackgroundMode) => {
    setTheme(prev => ({ ...prev, backgroundMode: mode }));
    persistPatch({ backgroundMode: mode });
  }, [persistPatch]);

  // Changing the effect or template reseeds the custom state to that
  // effect/template's default — the override is always a concrete state and
  // never leaks across effects.
  const commitBackgroundEffect = useCallback((effect: string) => {
    const nextEffect = normalizePanelBackgroundEffect(effect);
    const nextState = panelBackgroundState(nextEffect, themeRef.current.backgroundTemplate);
    setTheme(prev => ({ ...prev, backgroundEffect: nextEffect, backgroundEffectState: nextState }));
    persistPatch({ backgroundEffect: nextEffect, backgroundEffectState: nextState });
  }, [persistPatch]);

  const commitBackgroundTemplate = useCallback((template: number) => {
    const nextTemplate = normalizePanelBackgroundTemplate(template);
    const nextState = panelBackgroundState(themeRef.current.backgroundEffect, nextTemplate);
    setTheme(prev => ({ ...prev, backgroundTemplate: nextTemplate, backgroundEffectState: nextState }));
    persistPatch({ backgroundTemplate: nextTemplate, backgroundEffectState: nextState });
  }, [persistPatch]);

  const commitBackgroundEffectState = useCallback((state: EffectState) => {
    setTheme(prev => ({ ...prev, backgroundEffectState: state }));
    persistPatch({ backgroundEffectState: state });
  }, [persistPatch]);

  const commitBackgroundOpacity = useCallback((opacity: number) => {
    const nextOpacity = normalizePanelBackgroundOpacity(opacity);
    setTheme(prev => ({ ...prev, backgroundOpacity: nextOpacity }));
    persistPatch({ backgroundOpacity: nextOpacity });
  }, [persistPatch]);

  const commitWidgetOpacity = useCallback((opacity: number) => {
    const nextOpacity = normalizePanelWidgetOpacity(opacity);
    setTheme(prev => ({ ...prev, widgetOpacity: nextOpacity }));
    persistPatch({ widgetOpacity: nextOpacity });
  }, [persistPatch]);

  const commitWidgetLabels = useCallback((enabled: boolean) => {
    const next = normalizePanelWidgetLabels(enabled);
    setTheme(prev => ({ ...prev, widgetLabels: next }));
    persistPatch({ widgetLabels: next });
  }, [persistPatch]);

  const commitWidgetBlur = useCallback((enabled: boolean) => {
    const next = normalizePanelWidgetBlur(enabled);
    setTheme(prev => ({ ...prev, widgetBlur: next }));
    persistPatch({ widgetBlur: next });
  }, [persistPatch]);

  return {
    theme,
    commitThemeSync,
    commitThemeMode,
    commitAccentSync,
    previewAccent: (hex: string) => setTheme(prev => ({ ...prev, accentColor: hex })),
    commitAccent,
    previewBackground: (hex: string) => setTheme(prev => (
      resolvedModeRef.current === 'light'
        ? { ...prev, backgroundColorLight: hex }
        : { ...prev, backgroundColor: hex }
    )),
    commitBackground,
    commitBackgroundMode,
    commitBackgroundEffect,
    commitBackgroundTemplate,
    previewBackgroundEffectState: (state: EffectState) => setTheme(prev => ({ ...prev, backgroundEffectState: state })),
    commitBackgroundEffectState,
    previewBackgroundOpacity: (opacity: number) => setTheme(prev => (
      { ...prev, backgroundOpacity: normalizePanelBackgroundOpacity(opacity) }
    )),
    commitBackgroundOpacity,
    previewWidgetOpacity: (opacity: number) => setTheme(prev => (
      { ...prev, widgetOpacity: normalizePanelWidgetOpacity(opacity) }
    )),
    commitWidgetOpacity,
    commitWidgetLabels,
    commitWidgetBlur,
  };
}

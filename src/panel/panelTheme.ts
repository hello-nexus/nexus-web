import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTopicCallback } from '../hooks/useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import {
  DEFAULT_ACCENT, LANGUAGES, THEME_MODES, deriveAccentVars, resolveTheme,
  type Language, type ThemeMode,
} from '../lib/settings';
import { fetchPreferences, savePreferences } from '../api/profiles';
import { broadcastLayoutChanged, onLayoutChanged } from './engine/panelSync';
import {
  DEFAULT_PANEL_BACKGROUND_EFFECT,
  DEFAULT_PANEL_BACKGROUND_OPACITY,
  DEFAULT_PANEL_BACKGROUND_TEMPLATE,
  DEFAULT_PANEL_WIDGET_LABELS,
  DEFAULT_PANEL_WIDGET_OPACITY,
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundMode,
  normalizePanelBackgroundOpacity,
  normalizePanelBackgroundTemplate,
  normalizePanelWidgetLabels,
  normalizePanelWidgetOpacity,
  panelBackgroundPair,
  type PanelBackgroundMode,
} from './panelBackground';
import type { PanelThemeSettingsState, ResolvedPanelThemeMode } from './editor/PanelThemeSettings';

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
    '--panel-card-bg': 'var(--bg-card)',
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
  // Widget surface alpha. Replaces the implicit shader-mode softening with a
  // user-controlled slider; .panel-card in tokens.scss applies the alpha via
  // color-mix so only the background fades, not the contents.
  const widgetOpacityPct = Math.round(normalizePanelWidgetOpacity(theme.widgetOpacity) * 100);
  const vars: Record<string, string> = {
    ...accentVars,
    '--panel-card-bg': 'var(--bg-card)',
    '--panel-card-bg-opacity': `${widgetOpacityPct}%`,
    '--panel-accent': accentVars['--accent'],
    '--panel-accent-glow': accentVars['--accent-glow'],
    '--panel-accent-soft': accentVars['--accent-soft'],
    '--panel-accent-shadow': accentVars['--accent-glow-shadow'],
  };
  return vars as CSSProperties;
}

// Panel browsers (kiosk Edge, iOS WKWebView, other tabs) have their own
// localStorage; without this fetch they'd never see the desktop app's
// language choice. Mirrors the fetch-and-apply shape of usePanelTheme.
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

export function usePanelTheme(enabled = true, persist = true) {
  const [theme, setTheme] = useState<PanelThemeState>({
    appThemeMode: 'system',
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
    widgetOpacity: DEFAULT_PANEL_WIDGET_OPACITY,
    widgetLabels: DEFAULT_PANEL_WIDGET_LABELS,
  });
  const resolvedMode = useResolvedPanelThemeMode(
    theme.themeSyncWithDesktop ? theme.appThemeMode : theme.themeMode,
  );
  const resolvedModeRef = useRef<ResolvedPanelThemeMode>(resolvedMode);
  useEffect(() => { resolvedModeRef.current = resolvedMode; }, [resolvedMode]);
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  const fetchTheme = useCallback(() => {
    if (!enabled) return;
    fetchPreferences().then(prefs => {
      const t = prefs?.theme;
      const p = prefs?.panel;
      setTheme({
        appThemeMode: normalizePanelThemeMode(t?.themeMode),
        themeSyncWithDesktop: normalizePanelDesktopSync(p?.themeSyncWithDesktop),
        themeMode: normalizePanelThemeMode(p?.themeMode),
        appAccentColor: t?.accentColor || DEFAULT_ACCENT,
        accentSyncWithDesktop: normalizePanelDesktopSync(p?.accentSyncWithDesktop),
        accentColor: p?.accentColor ?? '',
        backgroundColor: p?.backgroundColor ?? '',
        backgroundColorLight: p?.backgroundColorLight ?? '',
        backgroundMode: normalizePanelBackgroundMode(p?.backgroundMode),
        backgroundEffect: normalizePanelBackgroundEffect(p?.backgroundEffect),
        backgroundTemplate: normalizePanelBackgroundTemplate(p?.backgroundTemplate),
        backgroundOpacity: normalizePanelBackgroundOpacity(p?.backgroundOpacity),
        widgetOpacity: normalizePanelWidgetOpacity(p?.widgetOpacity),
        widgetLabels: normalizePanelWidgetLabels(p?.widgetLabels),
      });
    }).catch(() => { /* keep local theme */ });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    fetchTheme();
    return onLayoutChanged(fetchTheme);
  }, [enabled, fetchTheme]);
  // Cross-device prefs push: any /preferences mutation publishes 'prefs'.
  useTopicCallback('prefs', enabled, fetchTheme);

  // `persist=false` (e.g. simulator test devices) keeps every change
  // local-only - the preview reacts but no /preferences write is made.
  const persistPatch = useCallback((patch: Parameters<typeof savePreferences>[0]) => {
    if (!persist) return;
    savePreferences(patch)
      .then(() => broadcastLayoutChanged())
      .catch(() => {});
  }, [persist]);

  const commitThemeSync = useCallback((synced: boolean) => {
    setTheme(prev => ({ ...prev, themeSyncWithDesktop: synced }));
    persistPatch({ panel: { themeSyncWithDesktop: synced } });
  }, [persistPatch]);

  const commitThemeMode = useCallback((mode: ThemeMode) => {
    const nextMode = normalizePanelThemeMode(mode);
    setTheme(prev => ({ ...prev, themeMode: nextMode }));
    persistPatch({ panel: { themeMode: nextMode } });
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
      panel: {
        accentSyncWithDesktop: synced,
        ...(!synced ? { accentColor: nextAccent || DEFAULT_ACCENT } : {}),
      },
    });
  }, [persistPatch]);

  const commitAccent = useCallback((hex: string) => {
    setTheme(prev => ({ ...prev, accentColor: hex }));
    persistPatch({ panel: { accentColor: hex } });
  }, [persistPatch]);

  const commitBackground = useCallback((hex: string) => {
    // Always set both theme slots from the same column so dark/light stay
    // paired in the picked hue family. Custom (non-preset) hex falls back to
    // the same value for both since no counterpart can be derived.
    const { dark, light } = panelBackgroundPair(hex);
    setTheme(prev => ({ ...prev, backgroundColor: dark, backgroundColorLight: light }));
    persistPatch({ panel: { backgroundColor: dark, backgroundColorLight: light } });
  }, [persistPatch]);

  const commitBackgroundMode = useCallback((mode: PanelBackgroundMode) => {
    setTheme(prev => ({ ...prev, backgroundMode: mode }));
    persistPatch({ panel: { backgroundMode: mode } });
  }, [persistPatch]);

  const commitBackgroundEffect = useCallback((effect: string) => {
    const nextEffect = normalizePanelBackgroundEffect(effect);
    setTheme(prev => ({ ...prev, backgroundEffect: nextEffect }));
    persistPatch({ panel: { backgroundEffect: nextEffect } });
  }, [persistPatch]);

  const commitBackgroundTemplate = useCallback((template: number) => {
    const nextTemplate = normalizePanelBackgroundTemplate(template);
    setTheme(prev => ({ ...prev, backgroundTemplate: nextTemplate }));
    persistPatch({ panel: { backgroundTemplate: nextTemplate } });
  }, [persistPatch]);

  const commitBackgroundOpacity = useCallback((opacity: number) => {
    const nextOpacity = normalizePanelBackgroundOpacity(opacity);
    setTheme(prev => ({ ...prev, backgroundOpacity: nextOpacity }));
    persistPatch({ panel: { backgroundOpacity: nextOpacity } });
  }, [persistPatch]);

  const commitWidgetOpacity = useCallback((opacity: number) => {
    const nextOpacity = normalizePanelWidgetOpacity(opacity);
    setTheme(prev => ({ ...prev, widgetOpacity: nextOpacity }));
    persistPatch({ panel: { widgetOpacity: nextOpacity } });
  }, [persistPatch]);

  const commitWidgetLabels = useCallback((enabled: boolean) => {
    const next = normalizePanelWidgetLabels(enabled);
    setTheme(prev => ({ ...prev, widgetLabels: next }));
    persistPatch({ panel: { widgetLabels: next } });
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
    previewBackgroundOpacity: (opacity: number) => setTheme(prev => (
      { ...prev, backgroundOpacity: normalizePanelBackgroundOpacity(opacity) }
    )),
    commitBackgroundOpacity,
    previewWidgetOpacity: (opacity: number) => setTheme(prev => (
      { ...prev, widgetOpacity: normalizePanelWidgetOpacity(opacity) }
    )),
    commitWidgetOpacity,
    commitWidgetLabels,
  };
}

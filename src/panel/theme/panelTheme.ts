import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { useTranslation } from '../../lib/i18n';
import {
  DEFAULT_ACCENT, LANGUAGES, THEME_MODES, deriveAccentVars, resolveTheme,
  type Language, type ThemeMode,
} from '../../lib/settings';
import { fetchPreferences, type Preferences } from '../../api/profiles';
import { patchPanelDevice, type PanelDevicePatch, type PanelDeviceRecord } from '../../api/panel';
import { broadcastLayoutChanged } from '../engine/panelSync';
import type { PanelRecordState } from '../engine/usePanelRecord';
import {
  DEFAULT_PANEL_BACKGROUND_TEMPLATE,
  defaultBackgroundOpacityForMode,
  backdropHintFromUrl,
  normalizePanelBackgroundEffect,
  resolvePanelBackdrop,
  type PanelBackdrop,
  normalizePanelBackgroundFrost,
  normalizePanelBackgroundMode,
  normalizePanelBackgroundOpacity,
  normalizePanelBackgroundTemplate,
  normalizePanelWidgetLabels,
  normalizePanelWidgetOpacity,
  normalizePanelWidgetPadding,
  panelBackgroundPair,
  panelBackgroundState,
  type PanelBackgroundMode,
} from '../background/panelBackground';
import { useAnimateTemplates } from '../../hooks/useAnimateTemplates';
import { saveAnimateTemplates } from '../../api/lighting';
import type { EffectState } from '../../types/lighting';
import type { PanelThemeSettingsState, ResolvedPanelThemeMode } from '../editor/PanelThemeSettings';
import { isSingleWidgetSurface, type PanelSurface } from '../types';
import { supportsDesktopWallpaper } from '../device/wiredPanel';

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
    '--panel-accent-text': accentVars['--accent-text'],
  } as CSSProperties;
}

export function buildPanelThemeVars(theme: PanelThemeState, resolvedThemeMode: ResolvedPanelThemeMode): CSSProperties {
  const accentColor = theme.accentSyncWithDesktop
    ? theme.appAccentColor
    : theme.accentColor || theme.appAccentColor;
  const accentVars = deriveAccentVars(accentColor || DEFAULT_ACCENT, resolvedThemeMode);
  // Widget surface alpha (user-controlled). .panel-card in tokens.scss applies
  // it via color-mix so only the background fades, not the contents. Live panels
  // fill from the OPAQUE surface variant (not the translucent --surface embedded
  // hosts use), so the slider is the sole transparency source and 100% is solid.
  const widgetOpacityPct = Math.round(normalizePanelWidgetOpacity(theme.widgetOpacity) * 100);
  const vars: Record<string, string> = {
    ...accentVars,
    '--panel-card-bg': 'var(--surface)',
    '--panel-card-fill': 'var(--panel-card-fill-opaque)',
    '--panel-card-bg-opacity': `${widgetOpacityPct}%`,
    '--panel-accent': accentVars['--accent'],
    '--panel-accent-glow': accentVars['--accent-glow'],
    '--panel-accent-soft': accentVars['--accent-soft'],
    '--panel-accent-shadow': accentVars['--accent-glow-shadow'],
    '--panel-accent-text': accentVars['--accent-text'],
  };
  return vars as CSSProperties;
}

// Per-surface theme overrides applied at render time (persisted theme is
// never mutated). Single-widget surfaces (q-series) force labels off so the
// tile fills the canvas, and force widget blur off + opacity 0 so the tile
// floats clean over the shader with no card chrome. The embedded desktop
// dashboard has no per-device theme record (INERT_PANEL_RECORD), so its
// widgetPadding never resolves past the initial default; this forces it to the
// slider's maximum (100%) as a surface-level default instead.
export function resolveEffectivePanelTheme(baseTheme: PanelThemeState, surface: PanelSurface): PanelThemeState {
  if (isSingleWidgetSurface(surface)) {
    return { ...baseTheme, widgetLabels: false, widgetOpacity: 0, widgetPadding: 0 };
  }
  if (surface === 'desktop') {
    return { ...baseTheme, widgetPadding: 100 };
  }
  return baseTheme;
}

// Panel browsers (kiosk Edge, iOS WKWebView, other tabs) have their own
// localStorage, so the desktop app's choice arrives with the preferences the
// theme hook already read.
const PREFS_RETRY_MS = [2000, 4000, 8000];

export function usePanelLanguageSync(enabled: boolean, prefs: Preferences | null) {
  const { language, setLanguage } = useTranslation();
  const next = prefs?.theme?.language;
  useEffect(() => {
    if (!enabled || typeof next !== 'string' || next === language) return;
    if (!(LANGUAGES as readonly string[]).includes(next)) return;
    setLanguage(next as Language);
  }, [enabled, next, language, setLanguage]);
}

/**
 * The panel's theme as the service describes it: desktop preferences supply
 * the sync sources (theme mode, accent), the device record everything
 * per-panel. Both may be absent, in which case every field takes its default.
 */
export function buildPanelTheme(prefs: Preferences | null, record: PanelDeviceRecord | null): PanelThemeState {
  const t = prefs?.theme;
  const r = record;
  // Single-widget immersive surfaces (q60) fill the screen with one tile, so a
  // solid background or an opaque widget would hide the lighting: they default
  // to the shader background behind a transparent widget.
  const single = isSingleWidgetSurface(r?.capabilities?.surface as PanelSurface);
  // Back-compat: seed the active shader's preset from the legacy scalar when
  // the per-shader map does not carry it.
  const effect = normalizePanelBackgroundEffect(r?.backgroundEffect);
  const templates: Record<string, number> = { ...(r?.backgroundTemplates ?? {}) };
  if (templates[effect] === undefined) {
    templates[effect] = normalizePanelBackgroundTemplate(r?.backgroundTemplate);
  }
  const bgMode: PanelBackgroundMode = r?.backgroundMode == null && single
    ? 'shader'
    : normalizePanelBackgroundMode(r?.backgroundMode);
  const backdrop = resolvePanelBackdrop(
    r?.backdrop,
    supportsDesktopWallpaper((r?.capabilities?.surface ?? '') as PanelSurface, !!r?.displayId),
  );
  return {
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
    backgroundMode: bgMode,
    backgroundEffect: effect,
    backgroundTemplate: normalizePanelBackgroundTemplate(templates[effect]),
    backgroundTemplates: templates,
    // No stored opacity: full strength in every mode (see
    // defaultBackgroundOpacityForMode, which keeps the per-mode seam), and
    // likewise under a non-theme backdrop, which must stay opaque so
    // see-through never inherits a shader/media dim.
    backgroundOpacity: r?.backgroundOpacity == null
      ? (backdrop !== 'theme' ? 1 : defaultBackgroundOpacityForMode(bgMode))
      : normalizePanelBackgroundOpacity(r.backgroundOpacity),
    backdrop,
    backgroundEffectState: panelBackgroundState(effect, normalizePanelBackgroundTemplate(templates[effect])),
    backgroundMediaId: r?.backgroundMediaId ?? null,
    backgroundMediaType: r?.backgroundMediaType ?? null,
    backgroundMediaAlpha: r?.backgroundMediaAlpha ?? false,
    backgroundFrost: normalizePanelBackgroundFrost(r?.backgroundFrostLevel),
    widgetOpacity: r?.widgetOpacity == null && single ? 0 : normalizePanelWidgetOpacity(r?.widgetOpacity),
    widgetLabels: normalizePanelWidgetLabels(r?.widgetLabels),
    widgetPadding: r?.widgetPadding == null && single ? 0 : normalizePanelWidgetPadding(r?.widgetPadding),
  };
}

/**
 * Desktop preferences, retried until they arrive and refreshed on the `prefs`
 * topic. A failed read keeps the last good copy: the panel must not snap back
 * to defaults because one request timed out.
 */
function usePanelPreferences(enabled: boolean): Preferences | null {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  const generation = useRef(0);

  const load = useCallback(() => {
    if (!enabled) return;
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    const mine = ++generation.current;
    const retryLater = () => {
      if (mine !== generation.current) return;
      const delay = PREFS_RETRY_MS[Math.min(attempt.current++, PREFS_RETRY_MS.length - 1)];
      retryTimer.current = setTimeout(load, delay);
    };
    void fetchPreferences().then(next => {
      if (mine !== generation.current) return;
      if (next) {
        attempt.current = 0;
        setPrefs(next);
        return;
      }
      retryLater();
    }).catch(retryLater);
  }, [enabled]);

  useEffect(() => {
    load();
    return () => {
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
  }, [load]);
  useTopicCallback('prefs', enabled, load);

  return prefs;
}

// Panel theme/visual settings are PER-PANEL on the device record
// (/panel/devices/{deviceId}), alongside the widget layout - NOT in shared
// `prefs.panel`. `deviceId` selects which panel's settings, so editing the Q60
// never touches the Y70. The only cross-surface link is the desktop app theme
// (`prefs.theme`), the sync source for theme-mode + accent when sync is on.
export function usePanelTheme(
  recordState: PanelRecordState,
  deviceId: string | null | undefined,
  enabled = true,
  persist = true,
) {
  const { record, loaded: recordLoaded } = recordState;
  const prefs = usePanelPreferences(enabled);
  const [theme, setTheme] = useState<PanelThemeState>(() => {
    const base = buildPanelTheme(null, null);
    const hint = backdropHintFromUrl();
    return hint && hint !== 'theme' ? { ...base, backdrop: hint, backgroundOpacity: 1 } : base;
  });
  const resolvedMode = useResolvedPanelThemeMode(
    // In sync mode prefer the desktop's *resolved* theme (concrete dark/light,
    // tracking the desktop OS). Fall back to appThemeMode when unpublished -
    // 'system' there would re-resolve against THIS device's OS (wrong OS).
    theme.themeSyncWithDesktop
      ? (theme.appResolvedThemeMode || theme.appThemeMode)
      : theme.themeMode,
  );
  const resolvedModeRef = useRef<ResolvedPanelThemeMode>(resolvedMode);
  useEffect(() => { resolvedModeRef.current = resolvedMode; }, [resolvedMode]);
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  // Universal preset source for the background. The wallpaper renders the global
  // Templates slot for the per-panel selection, and editing a background preset
  // writes here - so it stays in lockstep with the LED lighting and every panel.
  const { templates: globalTemplates } = useAnimateTemplates(enabled);
  const globalTemplatesRef = useRef(globalTemplates);
  useEffect(() => { globalTemplatesRef.current = globalTemplates; }, [globalTemplates]);
  // Live wallpaper preview while editing a slider; cleared whenever the global
  // presets refresh (the committed look has landed, or another surface edited it).
  const [draftBackgroundState, setDraftBackgroundState] = useState<EffectState | null>(null);
  useEffect(() => { setDraftBackgroundState(null); }, [globalTemplates]);

  useEffect(() => {
    if (!recordLoaded) return;
    setTheme(buildPanelTheme(prefs, record));
  }, [prefs, record, recordLoaded]);

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

  const commitBackdrop = useCallback((backdrop: PanelBackdrop) => {
    setTheme(prev => ({ ...prev, backdrop }));
    persistPatch({ backdrop });
  }, [persistPatch]);

  // Effect / template are the per-panel SELECTION (which universal preset this
  // panel points at). Persisted on the device record; clear the draft so the
  // newly-selected slot's global look shows.
  const commitBackgroundEffect = useCallback((effect: string) => {
    const nextEffect = normalizePanelBackgroundEffect(effect);
    setDraftBackgroundState(null);
    if (themeRef.current.backgroundEffect === nextEffect) return;
    // Switch to this panel's REMEMBERED preset for that shader (default 0) - the
    // selection is per-panel, per-shader, so switching never resets it.
    const nextTemplate = normalizePanelBackgroundTemplate(
      themeRef.current.backgroundTemplates[nextEffect] ?? DEFAULT_PANEL_BACKGROUND_TEMPLATE,
    );
    setTheme(prev => ({ ...prev, backgroundEffect: nextEffect, backgroundTemplate: nextTemplate }));
    persistPatch({ backgroundEffect: nextEffect, backgroundTemplate: nextTemplate });
  }, [persistPatch]);

  const commitBackgroundTemplate = useCallback((template: number) => {
    const nextTemplate = normalizePanelBackgroundTemplate(template);
    setDraftBackgroundState(null);
    const effect = themeRef.current.backgroundEffect;
    // Record the choice for THIS shader on this panel; send the whole map.
    const nextTemplates = { ...themeRef.current.backgroundTemplates, [effect]: nextTemplate };
    setTheme(prev => ({ ...prev, backgroundTemplate: nextTemplate, backgroundTemplates: nextTemplates }));
    persistPatch({ backgroundTemplate: nextTemplate, backgroundTemplates: nextTemplates });
  }, [persistPatch]);

  // Editing the background preset's params writes the UNIVERSAL slot (global
  // Templates) - so it also moves the LEDs when this is the live preset. The
  // draft shows it live until the global refresh lands.
  const commitBackgroundEffectState = useCallback((state: EffectState) => {
    const { backgroundEffect: effect, backgroundTemplate: template } = themeRef.current;
    const gt = globalTemplatesRef.current;
    const bundle = gt[effect];
    if (!bundle) return;
    const slots = bundle.slots.slice();
    slots[Math.min(Math.max(template, 0), slots.length - 1)] = state;
    setDraftBackgroundState(state);
    saveAnimateTemplates({ ...gt, [effect]: { ...bundle, slots } }).catch(() => {});
  }, []);

  const commitBackgroundOpacity = useCallback((opacity: number) => {
    const nextOpacity = normalizePanelBackgroundOpacity(opacity);
    setTheme(prev => ({ ...prev, backgroundOpacity: nextOpacity }));
    persistPatch({ backgroundOpacity: nextOpacity });
  }, [persistPatch]);

  const commitBackgroundMedia = useCallback((mediaId: string | null, type: 'static' | 'animated' | null, alpha = false) => {
    setTheme(prev => ({ ...prev, backgroundMediaId: mediaId, backgroundMediaType: type, backgroundMediaAlpha: alpha }));
    // The service patch-merge ignores a JSON null (means "no change"); an empty
    // string clears the field via NullIfEmpty, same as the other theme fields.
    persistPatch({ backgroundMediaId: mediaId ?? '', backgroundMediaType: type ?? '', backgroundMediaAlpha: alpha });
  }, [persistPatch]);

  const commitBackgroundFrost = useCallback((percent: number) => {
    const next = normalizePanelBackgroundFrost(percent);
    setTheme(prev => ({ ...prev, backgroundFrost: next }));
    persistPatch({ backgroundFrostLevel: next });
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

  const commitWidgetPadding = useCallback((percent: number) => {
    const next = normalizePanelWidgetPadding(percent);
    setTheme(prev => ({ ...prev, widgetPadding: next }));
    persistPatch({ widgetPadding: next });
  }, [persistPatch]);

  // The background's live render state: a draft while editing, else the global
  // preset slot for the per-panel selection.
  const backgroundEffectState = draftBackgroundState
    ?? panelBackgroundState(theme.backgroundEffect, theme.backgroundTemplate, globalTemplates[theme.backgroundEffect] ?? null);

  return {
    theme: { ...theme, backgroundEffectState },
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
    commitBackdrop,
    commitBackgroundEffect,
    commitBackgroundTemplate,
    previewBackgroundEffectState: (state: EffectState) => setDraftBackgroundState(state),
    commitBackgroundEffectState,
    previewBackgroundOpacity: (opacity: number) => setTheme(prev => (
      { ...prev, backgroundOpacity: normalizePanelBackgroundOpacity(opacity) }
    )),
    commitBackgroundOpacity,
    commitBackgroundMedia,
    previewBackgroundFrost: (percent: number) => setTheme(prev => (
      { ...prev, backgroundFrost: normalizePanelBackgroundFrost(percent) }
    )),
    commitBackgroundFrost,
    previewWidgetOpacity: (opacity: number) => setTheme(prev => (
      { ...prev, widgetOpacity: normalizePanelWidgetOpacity(opacity) }
    )),
    commitWidgetOpacity,
    commitWidgetLabels,
    previewWidgetPadding: (percent: number) => setTheme(prev => (
      { ...prev, widgetPadding: normalizePanelWidgetPadding(percent) }
    )),
    commitWidgetPadding,
    prefs,
  };
}

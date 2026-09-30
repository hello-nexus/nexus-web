import { normalizeSlideshowInterval, shuffledLap } from '../slideshow/slideshow';
import { appAvailableForSurface, lookupApp } from '../widgets/registry';
import {
  singleWidgetSurfaceSize,
  type PanelLayout,
  type PanelSurface,
  type PanelWidget,
  type PanelWidgetPlaylist,
} from '../types';

export const DEFAULT_WIDGET_PLAYLIST_INTERVAL = 15;

const PLAYLIST_WIDGET_ID_PREFIX = 'playlist:';

export function widgetPlaylistOf(layout: PanelLayout): PanelWidgetPlaylist {
  const stored = layout.widgetPlaylist;
  const types = Array.isArray(stored?.types)
    ? stored.types.filter((type): type is string => typeof type === 'string' && type.length > 0)
    : [];
  return {
    enabled: stored?.enabled === true,
    interval: normalizeSlideshowInterval(stored?.interval, DEFAULT_WIDGET_PLAYLIST_INTERVAL),
    shuffle: stored?.shuffle === true,
    types: [...new Set(types)],
  };
}

/**
 * Types the panel rotates through, or null when the playlist does not drive
 * the panel. Unknown types pass, as in PanelApp's render filter (an SDK app
 * resolves once the marketplace registry lands).
 */
export function playingPlaylistTypes(
  layout: PanelLayout,
  surface: PanelSurface,
  deviceTouch?: boolean,
): string[] | null {
  if (singleWidgetSurfaceSize(surface) === undefined) return null;
  const playlist = widgetPlaylistOf(layout);
  if (!playlist.enabled) return null;
  const types = playlist.types.filter(type => {
    const def = lookupApp(type);
    return !def || appAvailableForSurface(def.meta, surface, { deviceTouch });
  });
  return types.length > 0 ? types : null;
}

/**
 * The widget a playlist entry renders as: the shown widget for its own type,
 * else a render-only stand-in carrying the type's remembered config.
 */
export function playlistWidget(layout: PanelLayout, type: string, surface: PanelSurface): PanelWidget | undefined {
  const shown = layout.pages[0]?.widgets[0];
  if (shown?.type === type) return shown;
  const size = singleWidgetSurfaceSize(surface);
  if (size === undefined) return undefined;
  const config = layout.singleWidgetConfigs?.[type];
  return {
    id: `${PLAYLIST_WIDGET_ID_PREFIX}${type}`,
    type,
    size,
    col: 0,
    row: 0,
    config: config ? { ...config } : undefined,
  };
}

export function playlistTypeOfWidgetId(id: string): string | null {
  return id.startsWith(PLAYLIST_WIDGET_ID_PREFIX) ? id.slice(PLAYLIST_WIDGET_ID_PREFIX.length) : null;
}

export function updateWidgetPlaylist(layout: PanelLayout, patch: Partial<PanelWidgetPlaylist>): PanelLayout {
  return { ...layout, widgetPlaylist: { ...widgetPlaylistOf(layout), ...patch } };
}

/** The first switch-on seeds an empty playlist with the shown widget. */
export function setWidgetPlaylistEnabled(layout: PanelLayout, enabled: boolean): PanelLayout {
  const { types } = widgetPlaylistOf(layout);
  const shown = layout.pages[0]?.widgets[0];
  const seed = enabled && types.length === 0 && shown && shown.type !== 'blank' ? [shown.type] : types;
  return updateWidgetPlaylist(layout, { enabled, types: seed });
}

export function toggleWidgetPlaylistType(layout: PanelLayout, type: string): PanelLayout {
  const { types } = widgetPlaylistOf(layout);
  return updateWidgetPlaylist(layout, {
    types: types.includes(type) ? types.filter(t => t !== type) : [...types, type],
  });
}

/**
 * The type after `current`. Shuffle draws from `lap` (mutated in place), a
 * shuffled pass over every type that never opens on the type just shown.
 */
export function nextPlaylistType(
  types: readonly string[],
  current: string | null,
  shuffle: boolean,
  lap: string[],
  random: () => number = Math.random,
): string | null {
  if (types.length === 0) return null;
  if (types.length === 1) return types[0];
  if (!shuffle) {
    const at = current === null ? -1 : types.indexOf(current);
    return types[(at + 1) % types.length];
  }
  for (;;) {
    while (lap.length > 0) {
      const candidate = lap.shift()!;
      if (candidate !== current && types.includes(candidate)) return candidate;
    }
    lap.push(...shuffledLap(types, current, random));
  }
}

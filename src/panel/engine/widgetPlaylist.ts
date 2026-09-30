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
  return {
    enabled: stored?.enabled === true,
    interval: normalizeSlideshowInterval(stored?.interval, DEFAULT_WIDGET_PLAYLIST_INTERVAL),
    shuffle: stored?.shuffle === true,
    types: typeList(stored?.types),
    order: typeList(stored?.order),
    cursor: typeof stored?.cursor?.type === 'string' && Number.isFinite(stored.cursor.at)
      ? { type: stored.cursor.type, at: stored.cursor.at }
      : undefined,
  };
}

function typeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((type): type is string => typeof type === 'string' && type.length > 0))];
}

/** Library order: the stored arrangement, then types it has not seen yet in catalog order. */
export function playlistDisplayOrder(order: readonly string[], catalogTypes: readonly string[]): string[] {
  const known = order.filter(type => catalogTypes.includes(type));
  return [...known, ...catalogTypes.filter(type => !known.includes(type))];
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

/** The first switch-on enables every widget in `catalogTypes` except the blank one. */
export function setWidgetPlaylistEnabled(layout: PanelLayout, enabled: boolean, catalogTypes: readonly string[]): PanelLayout {
  if (enabled && layout.widgetPlaylist === undefined) {
    const types = catalogTypes.filter(type => type !== 'blank');
    return updateWidgetPlaylist(layout, { enabled, types, order: [...catalogTypes] });
  }
  return updateWidgetPlaylist(layout, { enabled });
}

/** The type `delta` steps from `shown` in play order, wrapping; unknown `shown` counts from the start. */
export function stepPlaylistType(types: readonly string[], shown: string | null, delta: 1 | -1): string | null {
  if (types.length === 0) return null;
  const at = shown === null ? -1 : types.indexOf(shown);
  if (at === -1) return delta === 1 ? types[0] : types[types.length - 1];
  return types[(at + delta + types.length) % types.length];
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

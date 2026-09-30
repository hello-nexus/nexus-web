// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  nextPlaylistType,
  playingPlaylistTypes,
  playlistTypeOfWidgetId,
  playlistWidget,
  setWidgetPlaylistEnabled,
  toggleWidgetPlaylistType,
  widgetPlaylistOf,
} from './widgetPlaylist';
import { appAvailableForSurface, getCatalogEntries } from '../widgets/registry';
import type { PanelLayout, PanelWidget } from '../types';

function widget(id: string, type: string, config?: PanelWidget['config']): PanelWidget {
  return { id, type, size: '2x4', col: 0, row: 0, config };
}

function layout(shown: PanelWidget | null, extra: Partial<PanelLayout> = {}): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'q60',
    pages: [{ id: 'p1', widgets: shown ? [shown] : [] }],
    ...extra,
  };
}

describe('widgetPlaylistOf', () => {
  it('defaults an absent playlist to off and empty', () => {
    expect(widgetPlaylistOf(layout(null))).toEqual({ enabled: false, interval: 15, shuffle: false, types: [] });
  });

  it('drops duplicate types and snaps an off-list interval', () => {
    const playlist = widgetPlaylistOf(layout(null, {
      widgetPlaylist: { enabled: true, interval: 14, shuffle: true, types: ['clock', 'weather', 'clock'] },
    }));
    expect(playlist.types).toEqual(['clock', 'weather']);
    expect(playlist.interval).toBe(15);
  });
});

describe('editor ops', () => {
  it('seeds the first switch-on with the shown widget', () => {
    const on = setWidgetPlaylistEnabled(layout(widget('a', 'clock')), true);
    expect(on.widgetPlaylist).toMatchObject({ enabled: true, types: ['clock'] });
  });

  it('keeps an existing playlist when switched back on', () => {
    const before = layout(widget('a', 'clock'), {
      widgetPlaylist: { enabled: false, interval: 30, shuffle: false, types: ['weather', 'media'] },
    });
    expect(setWidgetPlaylistEnabled(before, true).widgetPlaylist?.types).toEqual(['weather', 'media']);
  });

  it('toggles a type in at the end and out again', () => {
    const one = toggleWidgetPlaylistType(layout(null, {
      widgetPlaylist: { enabled: true, interval: 15, shuffle: false, types: ['clock'] },
    }), 'weather');
    expect(one.widgetPlaylist?.types).toEqual(['clock', 'weather']);
    expect(toggleWidgetPlaylistType(one, 'clock').widgetPlaylist?.types).toEqual(['weather']);
  });
});

describe('playingPlaylistTypes', () => {
  const on = (types: string[]) => layout(widget('a', 'clock'), {
    widgetPlaylist: { enabled: true, interval: 15, shuffle: false, types },
  });

  it('is null when off, empty, or on a multi-widget surface', () => {
    expect(playingPlaylistTypes(setWidgetPlaylistEnabled(on(['clock']), false), 'q60')).toBeNull();
    expect(playingPlaylistTypes(on([]), 'q60')).toBeNull();
    expect(playingPlaylistTypes(on(['clock', 'weather']), 'y70')).toBeNull();
  });

  it('skips a type the surface cannot show', () => {
    const unavailable = getCatalogEntries().find(([, def]) => !appAvailableForSurface(def.meta, 'q60'));
    expect(unavailable).toBeDefined();
    expect(playingPlaylistTypes(on(['clock', unavailable![0], 'weather']), 'q60')).toEqual(['clock', 'weather']);
  });
});

describe('playlistWidget', () => {
  it('renders the shown widget for its own type', () => {
    const shown = widget('a', 'clock', { format: '24h' });
    expect(playlistWidget(layout(shown), 'clock', 'q60')).toBe(shown);
  });

  it('renders another type with its remembered config under a playlist id', () => {
    const l = layout(widget('a', 'clock'), { singleWidgetConfigs: { weather: { units: 'c' } } });
    const stand = playlistWidget(l, 'weather', 'q60');
    expect(stand).toMatchObject({ type: 'weather', size: '2x4', config: { units: 'c' } });
    expect(playlistTypeOfWidgetId(stand!.id)).toBe('weather');
    expect(playlistTypeOfWidgetId('a')).toBeNull();
  });
});

describe('nextPlaylistType', () => {
  it('walks the list in order and wraps', () => {
    const types = ['a', 'b', 'c'];
    expect(nextPlaylistType(types, 'a', false, [])).toBe('b');
    expect(nextPlaylistType(types, 'c', false, [])).toBe('a');
    expect(nextPlaylistType(types, 'gone', false, [])).toBe('a');
  });

  it('shuffles every type once per lap without an immediate repeat', () => {
    const types = ['a', 'b', 'c', 'd'];
    const lap: string[] = [];
    let current = 'a';
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const next = nextPlaylistType(types, current, true, lap)!;
      expect(next).not.toBe(current);
      seen.push(next);
      current = next;
    }
    expect(new Set(seen)).toEqual(new Set(types));
  });

  it('holds a single type', () => {
    expect(nextPlaylistType(['a'], 'a', true, [])).toBe('a');
  });
});

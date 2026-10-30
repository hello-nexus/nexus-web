// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizePanelLayout } from './usePanelLayout';
import { removeWidgetById, swapSingleWidget } from './panelLayoutOps';
import { playlistWidget, widgetPlaylistOf } from './widgetPlaylist';
import { freeCells } from './freeCells';
import type { PanelLayout, PanelWidget } from '../types';

const clock: PanelWidget = { id: 'w1', type: 'clock', size: '2x4', col: 0, row: 0, config: { design: 'matrix' } };
const q60 = (widgets: PanelWidget[], extra: Partial<PanelLayout> = {}): PanelLayout => ({
  layoutSchemaVersion: 2,
  surface: 'q60',
  pages: [{ id: 'p1', widgets }],
  ...extra,
});
const capacity = { gridCols: 2, pageRows: 4 };

describe('single-widget surface with no widget', () => {
  it('removing the only widget leaves one empty page', () => {
    const next = removeWidgetById(q60([clock]), 'w1', capacity);
    expect(next.pages).toEqual([{ id: 'p1', widgets: [] }]);
  });

  it('normalization keeps the empty slot and does not seed a starter widget', () => {
    const normalized = normalizePanelLayout(removeWidgetById(q60([clock]), 'w1', capacity), 'q60');
    expect(normalized.pages).toHaveLength(1);
    expect(normalized.pages[0].widgets).toEqual([]);
  });

  it('keeps the remembered configs of other widget types when the slot is emptied', () => {
    const swapped = swapSingleWidget(q60([clock]), { id: 'w2', type: 'weather', size: '2x4', col: 0, row: 0 });
    const emptied = removeWidgetById(swapped, 'w2', capacity);
    expect(emptied.singleWidgetConfigs?.clock).toEqual({ design: 'matrix' });
  });

  it('a legacy blank widget normalizes to the same empty slot', () => {
    const legacy = q60([{ id: 'b', type: 'blank', size: '2x4', col: 0, row: 0 }]);
    const normalized = normalizePanelLayout(legacy, 'q60');
    expect(normalized.pages[0].widgets).toEqual([]);
    expect(normalized.pages).toEqual(normalizePanelLayout(removeWidgetById(q60([clock]), 'w1', capacity), 'q60').pages);
  });

  it('the whole grid is free, so the preview offers Edit background everywhere', () => {
    expect(freeCells([], capacity.gridCols, capacity.pageRows)).toHaveLength(8);
  });

  it('a widget playlist with an empty slot still resolves its entries', () => {
    const layout = q60([], { widgetPlaylist: { enabled: true, interval: 15, shuffle: false, types: ['clock'], order: ['clock'] } });
    expect(widgetPlaylistOf(layout).types).toEqual(['clock']);
    expect(playlistWidget(layout, 'clock', 'q60', 'dev')?.type).toBe('clock');
  });
});

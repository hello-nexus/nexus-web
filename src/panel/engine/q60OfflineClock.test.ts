// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { q60OfflineClockPages } from './q60OfflineClock';
import { singleWidgetSurfaceSize, type PanelLayout, type PanelPage } from '../types';
import { playingPlaylistTypes } from './widgetPlaylist';

describe('q60OfflineClockPages', () => {
  const monitoringLayout: PanelPage[] = [
    { id: 'p1', widgets: [{ id: 'w1', type: 'monitoring', size: '2x4', col: 0, row: 0 }] },
  ];

  it('collapses to a single page holding one clock widget that fills the surface', () => {
    const result = q60OfflineClockPages(monitoringLayout, 'q60');
    expect(result).toHaveLength(1);
    expect(result[0].widgets).toHaveLength(1);
    const w = result[0].widgets[0];
    expect(w.type).toBe('clock');
    expect(w.col).toBe(0);
    expect(w.row).toBe(0);
    expect(w.size).toBe(singleWidgetSurfaceSize('q60'));
  });

  it('reuses a configured clock widget config so the failsafe matches the live face', () => {
    const configured: PanelPage[] = [
      { id: 'p1', widgets: [{ id: 'c', type: 'clock', size: '2x4', col: 0, row: 0, config: { design: 'matrix', format: '12h' } }] },
    ];
    expect(q60OfflineClockPages(configured, 'q60')[0].widgets[0].config).toEqual({ design: 'matrix', format: '12h' });
  });

  it('uses default config when the live layout has no clock', () => {
    expect(q60OfflineClockPages(monitoringLayout, 'q60')[0].widgets[0].config).toBeUndefined();
  });

  it('leaves an empty panel empty', () => {
    const empty: PanelPage[] = [{ id: 'p1', widgets: [] }];
    expect(q60OfflineClockPages(empty, 'q60')).toBe(empty);
  });

  it('still shows the clock for an empty base slot when a widget playlist is on', () => {
    const empty: PanelPage[] = [{ id: 'p1', widgets: [] }];
    const result = q60OfflineClockPages(empty, 'q60', true);
    expect(result[0].widgets[0].type).toBe('clock');
  });

  it('leaves the chosen empty slot alone when the playlist is on but has nothing playable', () => {
    const empty: PanelPage[] = [{ id: 'p1', widgets: [] }];
    const layout = { layoutSchemaVersion: 2, surface: 'q60', pages: empty, widgetPlaylist: { enabled: true, interval: 15, shuffle: false, types: [] } } as PanelLayout;
    const playing = playingPlaylistTypes(layout, 'q60') !== null;
    expect(playing).toBe(false);
    expect(q60OfflineClockPages(empty, 'q60', playing)).toBe(empty);
  });

  it('does not mutate or reference the source pages (render-only)', () => {
    const result = q60OfflineClockPages(monitoringLayout, 'q60');
    expect(result[0]).not.toBe(monitoringLayout[0]);
    expect(monitoringLayout[0].widgets[0].type).toBe('monitoring');
  });
});

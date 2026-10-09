import { singleWidgetSurfaceSize, type PanelPage, type PanelSurface, type PanelWidget } from '../types';

/**
 * Q-series offline failsafe pages: a single page holding just the clock widget,
 * reusing a configured clock's settings when one is present so the face matches.
 * Render-only - callers swap this in for the rendered layout while the host is
 * unreachable and never persist it, so the configured widgets return on
 * reconnect. The size comes from the surface's single-widget constant (on a
 * grid, the widest tile), not the configured widget, so it fills the panel. A panel set to the blank
 * widget keeps its pages: the user chose an unobstructed background.
 */
export function q60OfflineClockPages(pages: PanelPage[], surface: PanelSurface): PanelPage[] {
  if (pages.some(p => p.widgets.some(w => w.type === 'blank'))) return pages;
  const configuredClock = pages.flatMap(p => p.widgets).find(w => w.type === 'clock');
  const clock: PanelWidget = {
    id: 'q60-offline-clock',
    type: 'clock',
    size: singleWidgetSurfaceSize(surface) ?? '4x4',
    col: 0,
    row: 0,
    config: configuredClock?.config,
  };
  return [{ id: 'q60-offline-clock-page', widgets: [clock] }];
}

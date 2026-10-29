import { PANEL_WIDGET_SIZE_MODES, widgetSizeShortSideSlots, type PanelWidgetSizeMode, type PanelWidgetSizeOptions } from '../types';

export interface WidgetSizeStop {
  mode: PanelWidgetSizeMode;
  // One of the fixed product labels (100 is the baseline), never a computed ratio.
  percent: number;
}

/**
 * The sizes a panel offers on its slider, each with its fixed label from `percentLabels`. Given the glass's
 * density-derived count, a stop that scales it is offered only when its count is at least 2 and differs from
 * the next stop toward 100%, so no two stops draw the same grid.
 */
export function widgetSizeStops(options: PanelWidgetSizeOptions, densitySlots?: number): WidgetSizeStop[] {
  const labelled = PANEL_WIDGET_SIZE_MODES.flatMap(mode => {
    const percent = options.percentLabels?.[mode];
    return options.layoutSurface[mode] && percent !== undefined ? [{ mode, percent }] : [];
  });
  if (densitySlots === undefined || !options.densitySlotShare) return labelled;
  const countOf = (mode: PanelWidgetSizeMode) => widgetSizeShortSideSlots(options, mode, densitySlots) ?? densitySlots;
  const baseline = labelled.find(stop => stop.percent === 100);
  if (!baseline) return labelled;
  const walk = (stops: WidgetSizeStop[]) => {
    const kept: WidgetSizeStop[] = [];
    let previous = countOf(baseline.mode);
    for (const stop of stops) {
      const count = countOf(stop.mode);
      if (count < 2 || count === previous) continue;
      kept.push(stop);
      previous = count;
    }
    return kept;
  };
  const above = walk(labelled.filter(stop => stop.percent > 100).sort((a, b) => a.percent - b.percent));
  const below = walk(labelled.filter(stop => stop.percent < 100).sort((a, b) => b.percent - a.percent));
  return [...above, baseline, ...below].sort((a, b) => b.percent - a.percent);
}

/** The stop nearest a dragged or typed percent; a tie takes the larger size. */
export function nearestWidgetSizeStop(stops: readonly WidgetSizeStop[], percent: number): WidgetSizeStop | undefined {
  let best: WidgetSizeStop | undefined;
  for (const stop of stops) {
    const d = Math.abs(stop.percent - percent);
    const bd = best ? Math.abs(best.percent - percent) : Infinity;
    if (d < bd || (d === bd && best && stop.percent > best.percent)) best = stop;
  }
  return best;
}

/**
 * The stop a stored size shows as: itself when offered, else the stop that lays out the same surface with the
 * same column count, else the nearest count on that surface, else the 100% baseline. Never a label outside the stops.
 */
export function stopForWidgetSize(
  options: PanelWidgetSizeOptions,
  stops: readonly WidgetSizeStop[],
  mode: PanelWidgetSizeMode,
  densitySlots?: number,
): WidgetSizeStop | undefined {
  const exact = stops.find(stop => stop.mode === mode);
  if (exact) return exact;
  const surface = options.layoutSurface[mode];
  const countOf = (m: PanelWidgetSizeMode) => widgetSizeShortSideSlots(options, m, densitySlots) ?? densitySlots;
  const target = countOf(mode);
  let best: WidgetSizeStop | undefined;
  let bestErr = Infinity;
  if (target) {
    for (const stop of stops) {
      const count = countOf(stop.mode);
      if (!count || options.layoutSurface[stop.mode] !== surface) continue;
      const err = Math.abs(Math.log(target / count));
      if (err < bestErr) { best = stop; bestErr = err; }
    }
  }
  return best ?? stops.find(stop => stop.percent === 100) ?? stops[0];
}

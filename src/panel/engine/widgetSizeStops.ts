import { PANEL_WIDGET_SIZE_MODES, widgetSizeShortSideSlots, type PanelWidgetSizeMode, type PanelWidgetSizeOptions } from '../types';

export interface WidgetSizeStop {
  mode: PanelWidgetSizeMode;
  // One of the fixed product labels (100 is the baseline), never a computed ratio.
  percent: number;
}

/** The slider stops of a panel, dropping any whose grid equals the next stop toward 100%. */
export function widgetSizeStops(options: PanelWidgetSizeOptions, densitySlots?: number): WidgetSizeStop[] {
  const labelled = PANEL_WIDGET_SIZE_MODES.flatMap(mode => {
    const percent = options.percentLabels?.[mode];
    return options.layoutSurface[mode] && percent !== undefined ? [{ mode, percent }] : [];
  });
  if (densitySlots === undefined || !options.densitySlotShare) return labelled;
  const countOf = (mode: PanelWidgetSizeMode) => widgetSizeShortSideSlots(options, mode, densitySlots) ?? densitySlots;
  const baseline = labelled.find(stop => stop.percent === 100);
  if (!baseline) return labelled;
  const gridOf = (mode: PanelWidgetSizeMode) => `${options.layoutSurface[mode]}:${countOf(mode)}`;
  const walk = (stops: WidgetSizeStop[]) => {
    const kept: WidgetSizeStop[] = [];
    let previous = gridOf(baseline.mode);
    for (const stop of stops) {
      if (countOf(stop.mode) < 2 || gridOf(stop.mode) === previous) continue;
      kept.push(stop);
      previous = gridOf(stop.mode);
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

/** The stops ordered smallest to largest, so a slider index runs left to right in even steps. */
export function widgetSizeTrackStops(stops: readonly WidgetSizeStop[]): WidgetSizeStop[] {
  return [...stops].sort((a, b) => a.percent - b.percent);
}

/** The percent label at a track index, clamped to the track. */
export function percentAtTrackIndex(track: readonly WidgetSizeStop[], index: number): number {
  const i = Math.min(track.length - 1, Math.max(0, Math.round(index)));
  return track[i].percent;
}

/** The track index of the stop nearest a percent. */
export function trackIndexOfPercent(track: readonly WidgetSizeStop[], percent: number): number {
  const stop = nearestWidgetSizeStop(track, percent);
  return stop ? track.indexOf(stop) : 0;
}

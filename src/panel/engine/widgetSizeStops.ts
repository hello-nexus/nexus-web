import { PANEL_WIDGET_SIZE_MODES, type PanelWidgetSizeMode, type PanelWidgetSizeOptions } from '../types';

export interface WidgetSizeStop {
  mode: PanelWidgetSizeMode;
  // One of the fixed product labels (100 is the baseline), never a computed ratio.
  percent: number;
}

/** The sizes a panel offers on its slider, each with its fixed label from `percentLabels`; a size with no label is not a stop. */
export function widgetSizeStops(options: PanelWidgetSizeOptions): WidgetSizeStop[] {
  return PANEL_WIDGET_SIZE_MODES.flatMap(mode => {
    const percent = options.percentLabels?.[mode];
    return options.layoutSurface[mode] && percent !== undefined ? [{ mode, percent }] : [];
  });
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

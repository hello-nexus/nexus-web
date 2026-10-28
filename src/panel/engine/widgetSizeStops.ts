import { panelGridCapacityForCanvas } from './grid';
import { getPanelGridSizingSettings } from '../../lib/panelSimulation';
import { PANEL_WIDGET_SIZE_MODES, widgetSizeShortSideSlots, type PanelSurface, type PanelWidgetSizeMode, type PanelWidgetSizeOptions } from '../types';

export interface WidgetSizeStop {
  mode: PanelWidgetSizeMode;
  // Cell width of this size as a whole percent of the Large size's.
  percent: number;
}

// The Y70's 4 / 6 / 8 column stops are labelled as even steps, by product decision, not as cell ratios.
const Y70_PERCENT: Record<PanelWidgetSizeMode, number> = { large: 100, small: 75, xsmall: 50 };

// Canvas used when the glass has not reported one, so the stops still come from real grid math.
const NOMINAL_CANVAS = { width: 1000, height: 1000 };

/**
 * The sizes a panel offers with each one's cell width as a percent of Large's, solved from the grids those
 * sizes actually produce on this canvas (CSS px at `dpr`). `dpiOf` is the density a size's layout surface runs at.
 */
export function widgetSizeStops(
  options: PanelWidgetSizeOptions,
  canvas: { width: number; height: number } | undefined,
  dpr: number,
  dpiOf: (mode: PanelWidgetSizeMode, layoutSurface: PanelSurface) => number | undefined,
  paddingRatio: number,
  densitySlots: number | undefined,
): WidgetSizeStop[] {
  const size = canvas ?? NOMINAL_CANVAS;
  const cellOf = (mode: PanelWidgetSizeMode): number | undefined => {
    const layoutSurface = options.layoutSurface[mode];
    if (!layoutSurface) return undefined;
    return panelGridCapacityForCanvas(
      Math.max(1, Math.round(size.width * dpr)),
      Math.max(1, Math.round(size.height * dpr)),
      {
        surface: layoutSurface,
        dpi: dpiOf(mode, layoutSurface),
        sizing: getPanelGridSizingSettings(),
        shortSideSlots: widgetSizeShortSideSlots(options, mode, densitySlots),
        paddingRatio,
      },
    ).cellSize;
  };
  const large = cellOf('large');
  const y70 = options.layoutSurface.large === 'y70';
  return PANEL_WIDGET_SIZE_MODES.flatMap(mode => {
    const cell = cellOf(mode);
    if (cell === undefined || !large) return [];
    if (y70) return [{ mode, percent: Y70_PERCENT[mode] }];
    return [{ mode, percent: mode === 'large' ? 100 : Math.max(1, Math.round((100 * cell) / large)) }];
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

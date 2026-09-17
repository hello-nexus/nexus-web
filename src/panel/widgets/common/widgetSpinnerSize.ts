import { widgetLayoutSize, type PanelWidgetSize } from '../../types';

/** One spinner scale for every widget's pre-first-fetch state: the two
 *  smallest cells take the smaller glyph, everything else the larger. */
export function widgetSpinnerSize(size: PanelWidgetSize): number {
  const layout = widgetLayoutSize(size);
  return layout === '1x1' || layout === '2x2' ? 32 : 40;
}

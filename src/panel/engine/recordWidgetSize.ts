import type { PanelDeviceRecord } from '../../api/panel';
import { PANEL_WIDGET_SIZE_MODES, sizeForLegacyGridSlots, type PanelSurface, type PanelWidgetSizeMode } from '../types';
import { densityShortSideSlots, estimateRuntimePanelDpi } from './panelGrid';

/** The Widget size a record lays out with; the kiosk and the device-page editor both read it here. A generic display from before the size choice reads its retired grid density as the nearest size. */
export function recordWidgetSizeOf(
  record: Pick<PanelDeviceRecord, 'widgetSize' | 'gridSlots' | 'displayId'> & { capabilities?: Pick<NonNullable<PanelDeviceRecord['capabilities']>, 'family' | 'cssWidth' | 'cssHeight' | 'dpr' | 'dpi'> } | null | undefined,
  glassSurface: PanelSurface,
): PanelWidgetSizeMode | undefined {
  const stored = PANEL_WIDGET_SIZE_MODES.find(m => m === record?.widgetSize);
  if (stored) return stored;
  const caps = record?.capabilities;
  if (!(glassSurface === 'monitor' && !caps?.family && !!record?.displayId)) return undefined;
  const density = caps?.cssWidth && caps.cssHeight
    ? densityShortSideSlots(caps.cssWidth, caps.cssHeight, caps.dpr || 1, caps.dpi ?? estimateRuntimePanelDpi(glassSurface))
    : undefined;
  return sizeForLegacyGridSlots(record?.gridSlots, density);
}

// One widget on the home page can be marked "immersive on load": the panel
// opens straight into its immersive view instead of the dashboard, and a swipe
// down returns to the dashboard exactly as it does for a tap-opened one.

import { isSingleWidgetSurface, surfaceSupportsTouch, type PanelLayout, type PanelSurface, type PanelWidget } from '../types';
import { lookupApp } from '../widgets/registry';
import { hasMarketplaceLoadedOnce, isMarketplaceType } from '../../widgets/marketplaceRegistry';

/**
 * Whether widgets on this surface can be marked at all. Mirrors the gate
 * onCellTap applies to a tap: a single-widget surface has no dashboard to skip,
 * and a touchless one (Q-series, cooler glass) never enters immersive. The
 * embedded desktop dashboard is excluded for the same reason as onCellTap's
 * `embedded` bail.
 */
export function surfaceSupportsImmersiveOnLoad(surface: PanelSurface, deviceTouch?: boolean): boolean {
  if (surface === 'desktop') return false;
  return !isSingleWidgetSurface(surface) && surfaceSupportsTouch(surface, deviceTouch);
}

/** Whether this widget type has an immersive view in the given orientation. */
export function widgetSupportsImmersiveOnLoad(type: string, landscape: boolean): boolean {
  const def = lookupApp(type);
  if (!def?.Touch) return false;
  return def.meta.supportsImmersive[landscape ? 'landscape' : 'portrait'];
}

/**
 * The widget to open immersive on load, or null. Only a first-page widget
 * qualifies: a mark on a widget that has moved off the home page is inert.
 */
export function resolveImmersiveOnLoadWidget(layout: PanelLayout): PanelWidget | null {
  const id = layout.immersiveOnLoadWidgetId;
  if (!id) return null;
  return layout.pages[0]?.widgets.find(w => w.id === id) ?? null;
}

/** True when this widget is the one the layout opens immersive on load. */
export function isImmersiveOnLoadWidget(layout: PanelLayout, widgetId: string): boolean {
  return resolveImmersiveOnLoadWidget(layout)?.id === widgetId;
}

/**
 * Whether this widget's edit options should offer the mark: a first-page widget
 * on a surface that has immersive, with an immersive view in the panel's current
 * orientation. Shared by the on-device sheet and the device page's pane so both
 * offer it on exactly the same widgets.
 */
export function canMarkImmersiveOnLoad(
  layout: PanelLayout,
  widget: PanelWidget | null,
  surface: PanelSurface,
  landscape: boolean,
  deviceTouch?: boolean,
): boolean {
  if (!widget || !surfaceSupportsImmersiveOnLoad(surface, deviceTouch)) return false;
  if (!layout.pages[0]?.widgets.some(w => w.id === widget.id)) return false;
  return widgetSupportsImmersiveOnLoad(widget.type, landscape);
}

/**
 * Whether the mark can be decided yet. An `app:<id>` widget only resolves once
 * the marketplace registry has loaded (an async fetch that has not returned when
 * the stored layout lands), and until then lookupApp reports no immersive view -
 * indistinguishable from a widget that truly has none. Answering "not yet" keeps
 * the caller's one-shot open from burning on a listing that is merely late.
 */
export function immersiveOnLoadResolvable(layout: PanelLayout): boolean {
  const widget = resolveImmersiveOnLoadWidget(layout);
  if (!widget || !isMarketplaceType(widget.type)) return true;
  return hasMarketplaceLoadedOnce();
}

/**
 * The widget this load should open immersive, or null. Composed here rather than
 * inline at the call site so the gate is testable without a panel render.
 */
export function immersiveOnLoadTarget(params: {
  layout: PanelLayout;
  surface: PanelSurface;
  landscape: boolean;
  deviceTouch?: boolean;
}): PanelWidget | null {
  const { layout, surface, landscape, deviceTouch } = params;
  if (!surfaceSupportsImmersiveOnLoad(surface, deviceTouch)) return null;
  const widget = resolveImmersiveOnLoadWidget(layout);
  if (!widget || !widgetSupportsImmersiveOnLoad(widget.type, landscape)) return null;
  return widget;
}

/**
 * Marks `widgetId` as the layout's immersive-on-load widget, replacing any
 * previous mark, or clears it with null. An id that names no first-page widget
 * clears instead of being stored.
 */
export function setImmersiveOnLoadWidgetId(layout: PanelLayout, widgetId: string | null): PanelLayout {
  const next = widgetId && layout.pages[0]?.widgets.some(w => w.id === widgetId)
    ? widgetId
    : undefined;
  if (next === layout.immersiveOnLoadWidgetId) return layout;
  return { ...layout, immersiveOnLoadWidgetId: next };
}

import type { LucideIcon } from 'lucide-react';
import type { ComponentType, LazyExoticComponent } from 'react';
import type { DashboardSectionNavigate } from '../panelLayoutHelpers';
import type { PanelConfigValue, PanelSurface, PanelWidget, PanelWidgetSize } from '../types';

// "App" is the conceptual unit — one per widget type. Each App has up
// to four facets, three of them optional:
//
//   Widget   (required)  the tile that appears in the panel grid.
//   Page     (optional)  the desktop SPA view that opens when the
//                        user clicks the widget tile on the dashboard.
//                        Apps with a Page are pinnable to the sidebar
//                        and become clickable on the embedded panel.
//   Touch    (optional)  the touch-friendly fullscreen presentation
//                        shown on panel kiosks (Y70 / phone) when the
//                        user enters fullscreen mode. Was called
//                        "Immersive" — kept the menu copy, renamed
//                        the field for clarity. Falls back to a
//                        generic fullscreen Widget wrapper when
//                        absent.
//   Settings (optional)  the right-click edit sheet contents.
//
// The marketplace consumes this same shape (with a synthetic
// AppManifest) so external apps register the same way as built-ins.

export interface WidgetProps {
  widget: PanelWidget;
  surface?: PanelSurface;
  selectedSlot?: number;
  onSelectSlot?: (slot: number) => void;
  // Provided by the touch overlay so widgets can lay out their
  // content into the same number of 4x4 cells per page as the panel
  // grid does. Undefined when rendered as a tile.
  immersiveGrid?: { columns: number; rows: number };
  // Only populated when the widget is rendered inside the embedded
  // desktop dashboard; widgets can call this to deep-link into a section.
  onSectionNavigate?: DashboardSectionNavigate;
  // Opens the widget's settings sheet. Wired by PanelApp; widgets surface
  // it from setup states ("Add API key…") so the user has a direct path
  // to config without going through the right-click context menu.
  onConfigure?: () => void;
}

export interface WidgetSettingsProps {
  widget: PanelWidget;
  onUpdate: (config: Record<string, PanelConfigValue>) => void;
  onResize: (size: PanelWidgetSize) => void;
  selectedSlot?: number;
  onSelectedSlotChange?: (slot: number) => void;
}

// Props passed to an App's desktop SPA Page. Each Page declares its
// own bespoke prop shape (serviceOnline, serviceState, etc.) — the
// manifest holds an opaque reference because rendering happens from
// Dashboard.renderMyComputerView, which passes the right props per
// case. The any-typing is intentional and gated to this slot.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppPageComponent = ComponentType<any>;

export interface AppMetadata {
  type: string;
  i18nKey: string;
  icon: LucideIcon;
  sizes: PanelWidgetSize[];
  defaultSize: PanelWidgetSize;
  // Size used both for the add-widget preview tile and for the inserted
  // widget when the user picks it. Optional override - when absent, the
  // smallest sensible size from `sizes` is chosen (2x2, then 4x2, then 4x4).
  // Set explicitly for "detailed" widgets where 2x2 is too cramped.
  pickerSize?: PanelWidgetSize;
  // Per-orientation flag for whether the touch fullscreen view is
  // available. The menu entry is gated on (Touch != null) && this.
  supportsImmersive: { portrait: boolean; landscape: boolean };
  hasConfig: boolean;
  // Whether the widget *requires* a touch / pointer input modality. true
  // means it's hidden on display-only surfaces (currently Q60). false means
  // it's available on every surface that can fit one of its `sizes` — desktop
  // (mouse), Y70 (touch), and phone (touch) all qualify, since they have a
  // pointer. Availability is computed from `touch` + `sizes` alone; there is
  // no per-widget surface allowlist.
  touch: boolean;
}

// Initial sheet state derived from where the user invoked the edit flow.
// Apps that have sub-elements the user might want pre-selected (e.g.
// monitoring slots) implement `resolveInitialSelection` to translate a
// viewport coordinate into the matching slot index.
export interface WidgetEditInitialSelection {
  selectedSlot?: number;
}

export interface AppManifest {
  meta: AppMetadata;
  // The widget tile — always present. Rendered in the panel grid.
  Widget: ComponentType<WidgetProps> | LazyExoticComponent<ComponentType<WidgetProps>>;
  // Optional desktop SPA "app page". Apps with a Page are
  // automatically pinnable to the sidebar and become click-through
  // on the dashboard panel.
  Page?: AppPageComponent | LazyExoticComponent<AppPageComponent>;
  // Optional touch-fullscreen view (was `ImmersiveComponent`). Only
  // widgets that ship this AND that have `meta.supportsImmersive`
  // true for the current orientation get the menu entry.
  Touch?: ComponentType<WidgetProps> | LazyExoticComponent<ComponentType<WidgetProps>>;
  // Optional right-click edit sheet contents.
  Settings?: ComponentType<WidgetSettingsProps> | LazyExoticComponent<ComponentType<WidgetSettingsProps>>;
  // Translates the press / right-click coordinate that summoned the
  // context menu into initial edit-sheet state. Called only when the
  // edit flow has a captured point (context-menu and long-press paths);
  // self-triggered configure buttons skip it.
  resolveInitialSelection?: (args: {
    point: { x: number; y: number };
    widget: PanelWidget;
  }) => WidgetEditInitialSelection | undefined;
}

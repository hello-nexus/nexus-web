import type { LucideIcon } from 'lucide-react';
import type { ComponentType, LazyExoticComponent } from 'react';
import type { DashboardSectionNavigate } from '../PanelApp';
import type { PanelConfigValue, PanelSurface, PanelWidget, PanelWidgetSize } from '../types';

export interface WidgetProps {
  widget: PanelWidget;
  surface?: PanelSurface;
  selectedSlot?: number;
  onSelectSlot?: (slot: number) => void;
  // Provided by the immersive overlay so widgets can lay out their
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

export type WidgetTouchSupport = 'touch-only' | 'any';

export interface WidgetSettingsProps {
  widget: PanelWidget;
  onUpdate: (config: Record<string, PanelConfigValue>) => void;
  onResize: (size: PanelWidgetSize) => void;
  selectedSlot?: number;
  onSelectedSlotChange?: (slot: number) => void;
}

export interface WidgetMetadata {
  type: string;
  i18nKey: string;
  icon: LucideIcon;
  supportedSurfaces: PanelSurface[];
  sizes: PanelWidgetSize[];
  defaultSize: PanelWidgetSize;
  // Size used both for the add-widget preview tile and for the inserted
  // widget when the user picks it. Optional override - when absent, the
  // smallest sensible size from `sizes` is chosen (2x2, then 4x2, then 4x4).
  // Set explicitly for "detailed" widgets where 2x2 is too cramped.
  pickerSize?: PanelWidgetSize;
  supportsImmersive: { portrait: boolean; landscape: boolean };
  hasConfig: boolean;
  // 'touch-only' = widget cannot be used on non-touch surfaces (Q-series).
  // 'any' = widget works on all supported surfaces; widgets with surface-aware
  // rendering (e.g. media) read `surface` from WidgetProps to adapt.
  touch: WidgetTouchSupport;
}

export interface WidgetDef {
  meta: WidgetMetadata;
  Component: ComponentType<WidgetProps> | LazyExoticComponent<ComponentType<WidgetProps>>;
  SettingsComponent?: ComponentType<WidgetSettingsProps> | LazyExoticComponent<ComponentType<WidgetSettingsProps>>;
  // Optional fullscreen renderer surfaced via the widget context menu's
  // "Immersive mode" entry. Only widgets that ship this AND that have
  // `meta.supportsImmersive[currentOrientation]` true get the menu entry.
  ImmersiveComponent?: ComponentType<WidgetProps> | LazyExoticComponent<ComponentType<WidgetProps>>;
}

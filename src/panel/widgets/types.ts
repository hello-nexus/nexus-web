import type { ComponentType, LazyExoticComponent } from 'react';
import type { DashboardSectionNavigate } from '../engine/panelLayoutHelpers';
import type { PanelConfigValue, PanelSurface, PanelWidget, PanelWidgetSize } from '../types';

// "App" is the conceptual unit - one per widget type. Each App has up
// to four facets, three of them optional:
//
//   Widget   (required)  the tile that appears in the panel grid.
//   Page     (optional)  the desktop SPA view that opens when the
//                        user clicks the widget tile on the dashboard.
//                        Apps with a Page are pinnable to the sidebar
//                        and become clickable on the embedded panel.
//   Touch    (optional)  the touch-friendly fullscreen presentation
//                        shown on panel kiosks (Y70 / phone) when the
//                        user enters fullscreen mode. Falls back to a
//                        generic fullscreen Widget wrapper when absent.
//   Settings (optional)  the right-click edit sheet contents.
//
// The marketplace consumes this same shape (with a synthetic
// AppManifest) so external apps register the same way as built-ins.

export interface WidgetProps {
  widget: PanelWidget;
  surface?: PanelSurface;
  // Companion to `surface` for surfaceSupportsTouch: 'monitor' is interactive
  // per-DEVICE (a promoted Xeneon Edge has a digitizer, a plain monitor does
  // not), so a widget gating on touch needs both or it reads every monitor as
  // non-interactive.
  deviceTouch?: boolean;
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
  // Deck-style widgets with pages/folders: the shared edit-mode view (which
  // page / folder the editor is on) so the live tile mirrors the edit sheet and
  // slot selection hit-tests the right grid. Undefined outside editing - run
  // mode keeps its own internal navigation state.
  editView?: DeckEditView;
  onEditViewChange?: (view: DeckEditView) => void;
  // Persist a config patch from the live tile (e.g. deck drag-reorder in edit
  // mode). Wired by PanelApp while editing a slot-selection widget, and on
  // every surface for a persistsFromTile widget.
  onUpdate?: (config: Record<string, PanelConfigValue>) => void;
  // True while this tile is drawn in the device-page editing canvas (the
  // /panel?simulator=1 iframe). Widgets use it for editor-only affordances
  // that must not appear on the real device - the gallery reveals its nav
  // arrows on hover, which a touch panel does by tap instead.
  editorPreview?: boolean;
}

// Which page + folder path a paged/foldered widget (deck) is currently
// showing in edit mode.
export interface DeckEditView {
  page: number;
  folderPath: number[];
}

export interface WidgetSettingsProps {
  widget: PanelWidget;
  // The surface the panel being edited runs on (desktop/phone/y70/q60). Gates
  // free-text fields (e.g. the icon search) off keyboard-less surfaces.
  surface?: PanelSurface;
  // True when the settings sheet is rendered in a desktop editor context
  // (PanelDevicePage's InlineWidgetSettings). Overrides surface-based gating
  // so free-text fields remain editable even when the target surface (y70/q60)
  // has no keyboard.
  desktopEditor?: boolean;
  onUpdate: (config: Record<string, PanelConfigValue>) => void;
  onResize: (size: PanelWidgetSize) => void;
  selectedSlot?: number;
  onSelectedSlotChange?: (slot: number) => void;
  // Shared paged/foldered edit view (deck) - see WidgetProps.editView.
  editView?: DeckEditView;
  onEditViewChange?: (view: DeckEditView) => void;
  // Deep-link to a dashboard section. Only wired by the desktop panel editor
  // (PanelDevicePage); undefined on device, where a settings sheet cannot
  // navigate the host app.
  onSectionNavigate?: DashboardSectionNavigate;
}

// Props passed to an App's desktop SPA Page. Each Page declares its
// own bespoke prop shape (serviceOnline, serviceState, etc.); the
// manifest holds an opaque reference because rendering happens from
// Dashboard.renderMyComputerView, which passes the right props per case.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppPageComponent = ComponentType<any>;

// An app's sidebar / picker glyph. Built-ins pass a lucide icon; an SDK app
// that ships an `icon` in its manifest passes a component rendering that mark
// instead (appIconComponent). Both accept the prop subset the render sites use,
// so every consumer draws `meta.icon` without knowing which kind it holds.
export type AppIcon = ComponentType<{
  size?: number | string;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

export interface AppMetadata {
  type: string;
  i18nKey: string;
  icon: AppIcon;
  sizes: PanelWidgetSize[];
  defaultSize: PanelWidgetSize;
  // When false, the app is hidden from the Add-a-Widget picker: it can't be
  // newly added, but already-placed instances keep rendering (lookupApp and the
  // layout reconciler ignore this flag). Defaults to listed. SDK apps derive it
  // from the marketplace enable allowlist; built-ins set it inline to delist.
  listed?: boolean;
  // Per-orientation flag for whether the touch fullscreen view is
  // available. The menu entry is gated on (Touch != null) && this.
  supportsImmersive: { portrait: boolean; landscape: boolean };
  // Only one instance per panel. Default (undefined/false) allows many, each
  // with its own config - the long-standing behaviour for every built-in.
  singleInstance?: boolean;
  hasConfig: boolean;
  // Whether the widget *requires* a touch / pointer input modality. true
  // means it's hidden on display-only surfaces (currently Q60). false means
  // it's available on every surface that can fit one of its `sizes` - desktop
  // (mouse), Y70 (touch), and phone (touch) all qualify, since they have a
  // pointer. Availability is computed from `touch` + `sizes` alone; there is
  // no per-widget surface allowlist.
  touch: boolean;
  // Whether the widget only makes sense on a panel hard-wired to this host:
  // hidden on remotely-connected panels (paired phone/browser/app sessions),
  // since a remote panel is itself the thing being paired. Defaults to false.
  localOnly?: boolean;
  // The inverse: the widget acts on the host FROM a paired remote (e.g. the
  // transfer widget sends the phone's photos/clipboard to the PC), so it's
  // hidden on the PC's own panel surfaces. Defaults to false.
  remoteOnly?: boolean;
  // Whether the widget's only interaction is its fullscreen `Touch` facet
  // (games). The desktop surface - the embedded dashboard and the floating
  // desktop overlay - never enters immersive, so the tile would be inert
  // there; set this to keep the widget on on-device panels only.
  panelOnly?: boolean;
  // Whether the widget participates in slot selection during editing: the live
  // tile renders selectable cells and the edit sheet edits the selected slot
  // (monitoring, deck). When true, PanelApp/WidgetEditSheet/PanelEditorSheet
  // pass selectedSlot/onSelectedSlotChange through. Defaults to false.
  usesSlotSelection?: boolean;
  // Initial config a freshly-added widget is seeded with (e.g. the deck's
  // starter actions). Called once at insert time; returns a fresh object so two
  // widgets never share mutable config. Absent → the widget starts config-less.
  defaultConfig?: () => Record<string, PanelConfigValue>;
  // Whether the live tile writes its own config (the gallery's picked image).
  // PanelApp passes onUpdate on every surface when set - unlike
  // usesSlotSelection, which only wires it while its edit sheet is open,
  // because the pick has to persist from the device too, not just the editor.
  persistsFromTile?: boolean;
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
  // The widget tile - always present. Rendered in the panel grid.
  Widget: ComponentType<WidgetProps> | LazyExoticComponent<ComponentType<WidgetProps>>;
  // Optional static stand-in for the add-widget catalog tile. Widgets whose
  // live tile subscribes to streaming data (e.g. monitoring graphs) ship this
  // so the picker preview shows frozen mock data instead of animating. Falls
  // back to `Widget` when absent.
  Preview?: ComponentType<WidgetProps> | LazyExoticComponent<ComponentType<WidgetProps>>;
  // Optional desktop SPA "app page". Apps with a Page are
  // automatically pinnable to the sidebar and become click-through
  // on the dashboard panel.
  Page?: AppPageComponent | LazyExoticComponent<AppPageComponent>;
  // Optional touch-fullscreen view. Only widgets that ship this AND
  // have `meta.supportsImmersive` true for the current orientation get
  // the menu entry.
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

import {
  Clock, Activity, Music, Lightbulb, Fan, Monitor,
  Hourglass, Watch, Calculator, Globe, Tv, Zap,
  PenLine, Smile, ImageIcon, Gamepad2, Grid3X3, Fish, BarChart, RadioTower, MessageCircle,
  Boxes, Usb,
} from 'lucide-react';
import { MarketplaceWidget } from './marketplace/MarketplaceWidget';
import { MarketplaceWidgetSettings } from './marketplace/MarketplaceWidgetSettings';
import {
  getAllMarketplaceListings,
  getMarketplaceListing,
  isMarketplaceType,
  marketplaceIdFromType,
  typeForMarketplace,
} from '../../widgets/marketplaceRegistry';
import type { WidgetDef } from './types';
import {
  SINGLE_WIDGET_SIZES,
  singleWidgetSurfaceSize,
  surfaceSupportsTouch,
  type PanelSurface,
  type PanelWidgetSize,
} from '../types';
import { ClockWidget } from './clock/ClockWidget';
import { PerformanceWidget } from './performance/PerformanceWidget';
import { MediaWidget } from './media/MediaWidget';
import { ScreentimeWidget } from './screentime/ScreentimeWidget';
import { DisplaysWidget } from './displays/DisplaysWidget';
import { LightingWidget } from './lighting/LightingWidget';
import { LightingImmersive } from './lighting/LightingImmersive';
import { MediaImmersive } from './media/MediaImmersive';
import { MonitoringImmersive } from './performance/MonitoringImmersive';
import { makeWidgetImmersive } from './common/WidgetImmersive';
import { CoolingWidget } from './cooling/CoolingWidget';
import { DevicesWidget } from './devices/DevicesWidget';
import { TimerWidget } from './timer/TimerWidget';
import { StopwatchWidget } from './stopwatch/StopwatchWidget';
import { CalculatorWidget } from './calculator/CalculatorWidget';
import { IFrameWidget } from './iframe/IFrameWidget';
import { TwitchChatWidget } from './twitch/TwitchChatWidget';
import { MacrosWidget } from './macros/MacrosWidget';
import { SnakeWidget } from './snake/SnakeWidget';
import { BlocksWidget } from './blocks/BlocksWidget';
import { AquariumWidget } from './aquarium/AquariumWidget';
import { WhiteboardWidget } from './whiteboard/WhiteboardWidget';
import { EmojiWidget } from './emoji/EmojiWidget';
import { GalleryWidget } from './gallery/GalleryWidget';
import { ObsWidget } from './obs/ObsWidget';
import { SteamWidget } from './steam/SteamWidget';
import { DiscordWidget } from './discord/DiscordWidget';
import { PerformanceSettings } from './settings/PerformanceSettings';
import { ClockSettings } from './settings/ClockSettings';
import { IFrameSettings } from './settings/IFrameSettings';
import { TwitchSettings } from './settings/TwitchSettings';
import { MacrosSettings } from './settings/MacrosSettings';
import { GallerySettings } from './settings/GallerySettings';
import { ObsSettings } from './settings/ObsSettings';
import { SteamSettings } from './settings/SteamSettings';
import { DiscordSettings } from './settings/DiscordSettings';

// Single source of truth for widget type -> metadata + component.
export const WIDGET_REGISTRY: Record<string, WidgetDef> = {
  clock: {
    meta: {
      type: 'clock',
      i18nKey: 'panel.widget.clock',
      icon: Clock,
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '4x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: false,
    },
    Component: ClockWidget,
    SettingsComponent: ClockSettings,
    ImmersiveComponent: makeWidgetImmersive(ClockWidget),
  },
  monitoring: {
    meta: {
      type: 'monitoring',
      i18nKey: 'panel.widget.monitoring',
      icon: Activity,
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '4x4',
      pickerSize: '4x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: false,
    },
    Component: PerformanceWidget,
    SettingsComponent: PerformanceSettings,
    ImmersiveComponent: MonitoringImmersive,
    resolveInitialSelection: ({ point, widget }) => {
      // PerformanceWidget stamps `data-monitoring-slot-index` on each slot
      // div/button (multi-slot layouts only; micro layouts have no per-slot
      // selection). We can't use elementFromPoint here because the context
      // menu is still mounted on top of the press point — it would shadow
      // the bottom-row slots whenever the menu opens upward. Query the
      // widget's slots directly and hit-test by bounding rect instead.
      if (typeof document === 'undefined') return undefined;
      const widgetEl = document.querySelector<HTMLElement>(
        `[data-panel-widget-id="${widget.id}"]`,
      );
      if (!widgetEl) return undefined;
      const slots = widgetEl.querySelectorAll<HTMLElement>('[data-monitoring-slot-index]');
      for (const slot of slots) {
        const r = slot.getBoundingClientRect();
        if (point.x >= r.left && point.x <= r.right
            && point.y >= r.top && point.y <= r.bottom) {
          const parsed = Number.parseInt(slot.dataset.monitoringSlotIndex ?? '', 10);
          if (Number.isFinite(parsed)) return { selectedSlot: parsed };
        }
      }
      return undefined;
    },
  },
  media: {
    meta: {
      type: 'media',
      i18nKey: 'panel.widget.media',
      icon: Music,
      sizes: ['2x2', '2x4', '4x2'],
      defaultSize: '4x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: false,
    },
    Component: MediaWidget,
    ImmersiveComponent: MediaImmersive,
  },
  screentime: {
    meta: {
      type: 'screentime',
      i18nKey: 'panel.widget.screentime',
      icon: BarChart,
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '4x2',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: true,
      touch: false,
    },
    Component: ScreentimeWidget,
  },
  lighting: {
    meta: {
      type: 'lighting',
      i18nKey: 'panel.widget.lighting',
      icon: Lightbulb,
      sizes: ['2x2', '4x2', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: false,
      touch: true,
    },
    Component: LightingWidget,
    ImmersiveComponent: LightingImmersive,
  },
  obs: {
    meta: {
      type: 'obs',
      i18nKey: 'panel.widget.obs',
      icon: RadioTower,
      sizes: ['2x2', '4x2', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: true,
    },
    Component: ObsWidget,
    SettingsComponent: ObsSettings,
  },
  steam: {
    meta: {
      type: 'steam',
      i18nKey: 'panel.widget.steam',
      icon: Gamepad2,
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: true,
    },
    Component: SteamWidget,
    SettingsComponent: SteamSettings,
  },
  discord: {
    meta: {
      type: 'discord',
      i18nKey: 'panel.widget.discord',
      icon: MessageCircle,
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: true,
    },
    Component: DiscordWidget,
    SettingsComponent: DiscordSettings,
  },
  cooling: {
    meta: {
      type: 'cooling',
      i18nKey: 'panel.widget.cooling',
      icon: Fan,
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '2x2',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: false,
    },
    Component: CoolingWidget,
  },
  devices: {
    meta: {
      type: 'devices',
      i18nKey: 'panel.widget.devices',
      icon: Usb,
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '2x2',
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: false,
      // Pager arrows + per-device tap-through controls — needs touch to
      // page between devices and configure them. Display-only surfaces
      // (q60) get this excluded by the widgetAvailableForSurface gate.
      touch: true,
    },
    Component: DevicesWidget,
  },
  displays: {
    meta: {
      type: 'displays',
      i18nKey: 'panel.widget.displays',
      icon: Monitor,
      sizes: ['2x2', '4x2'],
      defaultSize: '4x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: false,
      // Pointer-driven sliders (brightness, contrast) make this widget
      // touch-only — there's no read-only path. Display-only surfaces
      // (q60) get this excluded by the widgetAvailableForSurface gate.
      touch: true,
    },
    Component: DisplaysWidget,
  },
  timer: {
    meta: {
      type: 'timer',
      i18nKey: 'panel.widget.timer',
      icon: Hourglass,
      sizes: ['2x2', '4x2'],
      defaultSize: '2x2',
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: false,
      touch: true,
    },
    Component: TimerWidget,
  },
  stopwatch: {
    meta: {
      type: 'stopwatch',
      i18nKey: 'panel.widget.stopwatch',
      icon: Watch,
      sizes: ['2x2', '4x2'],
      defaultSize: '2x2',
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: false,
      touch: true,
    },
    Component: StopwatchWidget,
  },
  calculator: {
    meta: {
      type: 'calculator',
      i18nKey: 'panel.widget.calculator',
      icon: Calculator,
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: false,
      touch: true,
    },
    Component: CalculatorWidget,
  },
  iframe: {
    meta: {
      type: 'iframe',
      i18nKey: 'panel.widget.iframe',
      icon: Globe,
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: false,
    },
    Component: IFrameWidget,
    SettingsComponent: IFrameSettings,
  },
  twitch: {
    meta: {
      type: 'twitch',
      i18nKey: 'panel.widget.twitch',
      icon: Tv,
      sizes: ['2x4', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: false,
    },
    Component: TwitchChatWidget,
    SettingsComponent: TwitchSettings,
  },
  macros: {
    meta: {
      type: 'macros',
      i18nKey: 'panel.widget.macros',
      icon: Zap,
      sizes: ['1x1'],
      defaultSize: '1x1',
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: true,
      touch: true,
    },
    Component: MacrosWidget,
    SettingsComponent: MacrosSettings,
  },
  snake: {
    meta: {
      type: 'snake',
      i18nKey: 'panel.widget.snake',
      icon: Gamepad2,
      sizes: ['1x1', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: true,
    },
    Component: SnakeWidget,
  },
  blocks: {
    meta: {
      type: 'blocks',
      i18nKey: 'panel.widget.blocks',
      icon: Grid3X3,
      sizes: ['1x1', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: true,
    },
    Component: BlocksWidget,
  },
  aquarium: {
    meta: {
      type: 'aquarium',
      i18nKey: 'panel.widget.aquarium',
      icon: Fish,
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: true,
    },
    Component: AquariumWidget,
  },
  whiteboard: {
    meta: {
      type: 'whiteboard',
      i18nKey: 'panel.widget.whiteboard',
      icon: PenLine,
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: false,
      touch: true,
    },
    Component: WhiteboardWidget,
  },
  emoji: {
    meta: {
      type: 'emoji',
      i18nKey: 'panel.widget.emoji',
      icon: Smile,
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: true,
    },
    Component: EmojiWidget,
  },
  gallery: {
    meta: {
      type: 'gallery',
      i18nKey: 'panel.widget.gallery',
      icon: ImageIcon,
      sizes: ['1x1', '2x2', '2x4', '4x2', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: false,
    },
    Component: GalleryWidget,
    SettingsComponent: GallerySettings,
  },
};

// Whether a widget can appear on a given surface. The decision is purely
// capability-based: the widget's `touch` requirement vs the surface's input
// modality, and the widget's `sizes` vs the surface's accepted sizes. No
// per-widget surface allowlist — desktop (mouse), Y70 (touch), and phone
// (touch) all expose a pointer and accept every widget whose sizes match.
// Single-widget surfaces (Q60) lock to one size and additionally exclude
// touch-required widgets since they have no pointer at all.
export function widgetAvailableForSurface(meta: WidgetDef['meta'], surface: PanelSurface): boolean {
  if (meta.touch && !surfaceSupportsTouch(surface)) return false;
  const single = singleWidgetSurfaceSize(surface);
  if (single !== undefined) {
    return meta.sizes.includes(single);
  }
  // Multi-widget surfaces accept the widget when it has at least one size
  // that isn't reserved for a single-widget surface (i.e. an actual
  // multi-widget size). A widget that only declares 2x4 would otherwise
  // appear with zero placeable sizes on the desktop / Y70 catalog.
  return meta.sizes.some(s => !SINGLE_WIDGET_SIZES.has(s));
}

export function lookupWidget(type: string): WidgetDef | undefined {
  if (isMarketplaceType(type)) {
    const id = marketplaceIdFromType(type);
    if (!id) return undefined;
    const listing = getMarketplaceListing(id);
    if (!listing) return undefined;
    return makeMarketplaceWidgetDef(id, listing.name, listing.sizes, listing.defaultSize);
  }
  return WIDGET_REGISTRY[type];
}

/**
 * Panel catalog + add-widget modal source. Returns every static widget
 * plus one synthetic entry per installed marketplace widget, keyed by
 * `marketplace:<id>`. The Add Widget catalog iterates this so external
 * widgets show up next to the built-ins with the standard preview / drag /
 * resize chrome - no custom UI.
 */
export function getCatalogEntries(): Array<[string, WidgetDef]> {
  const builtIns = Object.entries(WIDGET_REGISTRY);
  const marketplace = getAllMarketplaceListings().map((listing): [string, WidgetDef] => [
    typeForMarketplace(listing.id),
    makeMarketplaceWidgetDef(listing.id, listing.name, listing.sizes, listing.defaultSize),
  ]);
  return [...builtIns, ...marketplace];
}

// Panel-engine sizes the marketplace synthetic WidgetDef accepts. The
// manifest may declare any string here; anything outside this set falls
// through the filter so a typo can't crash the picker.
const VALID_MARKETPLACE_SIZES: ReadonlyArray<PanelWidgetSize> = ['1x1', '2x2', '4x2', '4x4'];

// Synthesise a panel WidgetDef for a marketplace widget. Sizes come from the
// listing's manifest so a 1x1 macros widget stays 1x1 and a 4x2-only weather
// stays 4x2. Anything the manifest declares that the panel engine doesn't
// know about is filtered out.
function makeMarketplaceWidgetDef(
  id: string,
  label: string,
  manifestSizes: string[] | undefined,
  manifestDefault: string | undefined,
): WidgetDef {
  const sizes = (manifestSizes ?? [])
    .filter((s): s is PanelWidgetSize => (VALID_MARKETPLACE_SIZES as readonly string[]).includes(s));
  const safeSizes: PanelWidgetSize[] = sizes.length > 0 ? sizes : ['2x2'];
  const defaultSize: PanelWidgetSize =
    (manifestDefault && (safeSizes as readonly string[]).includes(manifestDefault))
      ? (manifestDefault as PanelWidgetSize)
      : safeSizes[0];
  return {
    meta: {
      type: typeForMarketplace(id),
      i18nKey: label,
      icon: Boxes,
      sizes: safeSizes,
      defaultSize,
      pickerSize: defaultSize,
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: true,
      touch: false,
    },
    Component: MarketplaceWidget,
    SettingsComponent: MarketplaceWidgetSettings,
  };
}

// Allowed sizes for a widget on a given surface.
//
// Single-widget surfaces lock to one size: return [singleSize] when the
// widget supports it (and is input-compatible), else [].
//
// Multi-widget surfaces hide any size reserved by a single-widget
// surface (e.g. 2x4 belongs to q60; everywhere else doesn't see it).
// The reconciler snaps existing widgets at a hidden size to the nearest
// non-reserved size on load.
export function sizesForSurface(meta: WidgetDef['meta'], surface?: PanelSurface): PanelWidgetSize[] {
  if (!surface) return [...meta.sizes];
  if (meta.touch && !surfaceSupportsTouch(surface)) return [];
  const single = singleWidgetSurfaceSize(surface);
  if (single !== undefined) {
    return meta.sizes.includes(single) ? [single] : [];
  }
  return meta.sizes.filter(s => !SINGLE_WIDGET_SIZES.has(s));
}

// Size to use in the add-widget picker (preview + insertion size). Honors
// an explicit `pickerSize`; otherwise picks the smallest sensible — 1x1
// then 2x2 then 4x2 then 4x4 — so newly added widgets stay compact.

export function pickerSizeFor(meta: WidgetDef['meta'], surface?: PanelSurface): PanelWidgetSize {
  const sizes = sizesForSurface(meta, surface);
  if (meta.pickerSize && sizes.includes(meta.pickerSize)) return meta.pickerSize;
  if (sizes.includes('1x1')) return '1x1';
  if (sizes.includes('2x2')) return '2x2';
  if (sizes.includes('4x2')) return '4x2';
  if (sizes.includes('4x4')) return '4x4';
  return meta.defaultSize;
}

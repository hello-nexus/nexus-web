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
import { Q60_WIDGET_SIZES, surfaceSupportsTouch, type PanelSurface, type PanelWidgetSize } from '../types';
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
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '4x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'any',
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
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '4x4',
      pickerSize: '4x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'any',
    },
    Component: PerformanceWidget,
    SettingsComponent: PerformanceSettings,
    ImmersiveComponent: MonitoringImmersive,
    resolveInitialSelection: ({ point }) => {
      // PerformanceWidget stamps `data-monitoring-slot-index` on each slot
      // div/button (multi-slot layouts only; micro layouts have no per-slot
      // selection). Walk up from the press point to land on the closest slot.
      const el = typeof document !== 'undefined'
        ? document.elementFromPoint(point.x, point.y)
        : null;
      const slot = el instanceof Element
        ? el.closest<HTMLElement>('[data-monitoring-slot-index]')
        : null;
      const idx = slot?.dataset.monitoringSlotIndex;
      if (idx === undefined) return undefined;
      const parsed = Number.parseInt(idx, 10);
      return Number.isFinite(parsed) ? { selectedSlot: parsed } : undefined;
    },
  },
  media: {
    meta: {
      type: 'media',
      i18nKey: 'panel.widget.media',
      icon: Music,
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['2x2', '2x4', '4x2'],
      defaultSize: '4x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'any',
    },
    Component: MediaWidget,
    ImmersiveComponent: MediaImmersive,
  },
  screentime: {
    meta: {
      type: 'screentime',
      i18nKey: 'panel.widget.screentime',
      icon: BarChart,
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '4x2',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: true,
      touch: 'any',
    },
    Component: ScreentimeWidget,
  },
  lighting: {
    meta: {
      type: 'lighting',
      i18nKey: 'panel.widget.lighting',
      icon: Lightbulb,
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['2x2', '4x2', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: false,
      touch: 'touch-only',
    },
    Component: LightingWidget,
    ImmersiveComponent: LightingImmersive,
  },
  obs: {
    meta: {
      type: 'obs',
      i18nKey: 'panel.widget.obs',
      icon: RadioTower,
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['2x2', '4x2', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'touch-only',
    },
    Component: ObsWidget,
    SettingsComponent: ObsSettings,
  },
  steam: {
    meta: {
      type: 'steam',
      i18nKey: 'panel.widget.steam',
      icon: Gamepad2,
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'touch-only',
    },
    Component: SteamWidget,
    SettingsComponent: SteamSettings,
  },
  discord: {
    meta: {
      type: 'discord',
      i18nKey: 'panel.widget.discord',
      icon: MessageCircle,
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'touch-only',
    },
    Component: DiscordWidget,
    SettingsComponent: DiscordSettings,
  },
  cooling: {
    meta: {
      type: 'cooling',
      i18nKey: 'panel.widget.cooling',
      icon: Fan,
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '2x2',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: 'any',
    },
    Component: CoolingWidget,
  },
  devices: {
    meta: {
      type: 'devices',
      i18nKey: 'panel.widget.devices',
      icon: Usb,
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '2x2',
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: false,
      // Pager arrows + per-device tap-through controls — needs touch to
      // page between devices and configure them. Display-only surfaces
      // (q60) get this excluded by the widgetAvailableForSurface gate.
      touch: 'touch-only',
    },
    Component: DevicesWidget,
  },
  displays: {
    meta: {
      type: 'displays',
      i18nKey: 'panel.widget.displays',
      icon: Monitor,
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['2x2', '4x2'],
      defaultSize: '4x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: false,
      // Pointer-driven sliders (brightness, contrast) make this widget
      // touch-only — there's no read-only path. Display-only surfaces
      // (q60) get this excluded by the widgetAvailableForSurface gate.
      touch: 'touch-only',
    },
    Component: DisplaysWidget,
  },
  timer: {
    meta: {
      type: 'timer',
      i18nKey: 'panel.widget.timer',
      icon: Hourglass,
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['2x2', '4x2'],
      defaultSize: '2x2',
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: false,
      touch: 'touch-only',
    },
    Component: TimerWidget,
  },
  stopwatch: {
    meta: {
      type: 'stopwatch',
      i18nKey: 'panel.widget.stopwatch',
      icon: Watch,
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['2x2', '4x2'],
      defaultSize: '2x2',
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: false,
      touch: 'touch-only',
    },
    Component: StopwatchWidget,
  },
  calculator: {
    meta: {
      type: 'calculator',
      i18nKey: 'panel.widget.calculator',
      icon: Calculator,
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: false,
      touch: 'touch-only',
    },
    Component: CalculatorWidget,
  },
  iframe: {
    meta: {
      type: 'iframe',
      i18nKey: 'panel.widget.iframe',
      icon: Globe,
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['2x2', '2x4', '4x2', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'any',
    },
    Component: IFrameWidget,
    SettingsComponent: IFrameSettings,
  },
  twitch: {
    meta: {
      type: 'twitch',
      i18nKey: 'panel.widget.twitch',
      icon: Tv,
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['2x4', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'any',
    },
    Component: TwitchChatWidget,
    SettingsComponent: TwitchSettings,
  },
  macros: {
    meta: {
      type: 'macros',
      i18nKey: 'panel.widget.macros',
      icon: Zap,
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['1x1'],
      defaultSize: '1x1',
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: true,
      touch: 'touch-only',
    },
    Component: MacrosWidget,
    SettingsComponent: MacrosSettings,
  },
  snake: {
    meta: {
      type: 'snake',
      i18nKey: 'panel.widget.snake',
      icon: Gamepad2,
      supportedSurfaces: ['y70', 'phone'],
      sizes: ['1x1', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: 'touch-only',
    },
    Component: SnakeWidget,
  },
  blocks: {
    meta: {
      type: 'blocks',
      i18nKey: 'panel.widget.blocks',
      icon: Grid3X3,
      supportedSurfaces: ['y70', 'phone'],
      sizes: ['1x1', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: 'touch-only',
    },
    Component: BlocksWidget,
  },
  aquarium: {
    meta: {
      type: 'aquarium',
      i18nKey: 'panel.widget.aquarium',
      icon: Fish,
      supportedSurfaces: ['y70', 'phone'],
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: 'touch-only',
    },
    Component: AquariumWidget,
  },
  whiteboard: {
    meta: {
      type: 'whiteboard',
      i18nKey: 'panel.widget.whiteboard',
      icon: PenLine,
      supportedSurfaces: ['y70', 'phone'],
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: false,
      touch: 'touch-only',
    },
    Component: WhiteboardWidget,
  },
  emoji: {
    meta: {
      type: 'emoji',
      i18nKey: 'panel.widget.emoji',
      icon: Smile,
      supportedSurfaces: ['y70', 'phone'],
      sizes: ['4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: 'touch-only',
    },
    Component: EmojiWidget,
  },
  gallery: {
    meta: {
      type: 'gallery',
      i18nKey: 'panel.widget.gallery',
      icon: ImageIcon,
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['1x1', '2x2', '2x4', '4x2', '4x4'],
      defaultSize: '4x4',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'any',
    },
    Component: GalleryWidget,
    SettingsComponent: GallerySettings,
  },
};

// Whether a widget can appear on a given surface. Combines `supportedSurfaces`
// (form-factor compatibility) with `touch` (input requirement). Touch-only
// widgets are unavailable on display-only surfaces regardless of supportedSurfaces.
//
// Q-series is derived from capabilities, not from an explicit
// `supportedSurfaces: [..., 'q60']` opt-in. The rule is: any widget that
// declares a 2x4 size AND is not flagged touch-only is available on the
// Q-series. This keeps the catalog complete without having to remember to
// add q60 to every new non-touch widget's manifest.
export function widgetAvailableForSurface(meta: WidgetDef['meta'], surface: PanelSurface): boolean {
  if (surface === 'q60') {
    if (meta.touch === 'touch-only') return false;
    if (!meta.sizes.includes('2x4')) return false;
    return true;
  }
  if (!meta.supportedSurfaces.includes(surface)) return false;
  if (meta.touch === 'touch-only' && !surfaceSupportsTouch(surface)) return false;
  return true;
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
      supportedSurfaces: ['desktop', 'phone', 'y70'],
      sizes: safeSizes,
      defaultSize,
      pickerSize: defaultSize,
      supportsImmersive: { portrait: false, landscape: false },
      hasConfig: true,
      touch: 'any',
    },
    Component: MarketplaceWidget,
    SettingsComponent: MarketplaceWidgetSettings,
  };
}

// Allowed sizes for a widget on a given surface. Q60 has its own
// allowlist (display-only, no touch). Everything else returns the
// manifest's `sizes` array verbatim.
//
// On Q-series the only valid runtime size is 2x4 — see
// `Q60_WIDGET_SIZES`. We return that single-element allowlist whenever
// the widget is also Q-series-available per `widgetAvailableForSurface`
// (touch-allowed + declares a 2x4 size). For everything else, the
// manifest's full `sizes` array is returned verbatim.
export function sizesForSurface(meta: WidgetDef['meta'], surface?: PanelSurface): PanelWidgetSize[] {
  if (surface === 'q60' && meta.sizes.includes('2x4') && meta.touch !== 'touch-only') {
    return [...Q60_WIDGET_SIZES];
  }
  return [...meta.sizes];
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

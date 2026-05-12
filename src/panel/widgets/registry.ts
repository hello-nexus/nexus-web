import {
  Clock, Activity, Music, Cloud, Lightbulb, Fan, Monitor,
  Hourglass, Watch, Calculator, Globe, Tv, Zap,
  PenLine, Smile, ImageIcon, Gamepad2, Grid3X3, Fish, BarChart, RadioTower, MessageCircle,
} from 'lucide-react';
import type { WidgetDef } from './types';
import { Q60_WIDGET_SIZES, surfaceSupportsTouch, type PanelSurface, type PanelWidgetSize } from '../types';
import { ClockWidget } from './clock/ClockWidget';
import { WeatherWidget } from './weather/WeatherWidget';
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
import { WeatherSettings } from './settings/WeatherSettings';
import { ObsSettings } from './settings/ObsSettings';
import { SteamSettings } from './settings/SteamSettings';
import { DiscordSettings } from './settings/DiscordSettings';

// Single source of truth for widget type -> metadata + component.
// Phase 2: all v1 widgets have real components. PlaceholderWidget stays
// around for Phase 3 use when a user adds a new widget before it has been
// wired up.
export const WIDGET_REGISTRY: Record<string, WidgetDef> = {
  clock: {
    meta: {
      type: 'clock',
      i18nKey: 'panel.widget.clock',
      icon: Clock,
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['2x2', '4x2', '4x4'],
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
      sizes: ['2x2', '4x2', '4x4'],
      defaultSize: '4x4',
      pickerSize: '4x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'any',
    },
    Component: PerformanceWidget,
    SettingsComponent: PerformanceSettings,
    ImmersiveComponent: MonitoringImmersive,
  },
  media: {
    meta: {
      type: 'media',
      i18nKey: 'panel.widget.media',
      icon: Music,
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['2x2', '4x2'],
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
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['2x2', '4x2', '4x4'],
      defaultSize: '4x2',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: true,
      touch: 'any',
    },
    Component: ScreentimeWidget,
  },
  weather: {
    meta: {
      type: 'weather',
      i18nKey: 'panel.widget.weather',
      icon: Cloud,
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['1x1', '2x2', '4x2', '4x4'],
      defaultSize: '2x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: true,
      touch: 'any',
    },
    Component: WeatherWidget,
    SettingsComponent: WeatherSettings,
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
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['2x2', '4x2', '4x4'],
      defaultSize: '2x2',
      supportsImmersive: { portrait: true, landscape: false },
      hasConfig: false,
      touch: 'any',
    },
    Component: CoolingWidget,
  },
  displays: {
    meta: {
      type: 'displays',
      i18nKey: 'panel.widget.displays',
      icon: Monitor,
      supportedSurfaces: ['y70', 'q60', 'phone', 'desktop'],
      sizes: ['2x2', '4x2'],
      defaultSize: '4x2',
      supportsImmersive: { portrait: true, landscape: true },
      hasConfig: false,
      touch: 'any',
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
      sizes: ['2x2', '4x2', '4x4'],
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
      supportedSurfaces: ['y70', 'phone', 'desktop'],
      sizes: ['4x4'],
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
      sizes: ['1x1', '2x2', '4x2', '4x4'],
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
export function widgetAvailableForSurface(meta: WidgetDef['meta'], surface: PanelSurface): boolean {
  if (!meta.supportedSurfaces.includes(surface)) return false;
  if (meta.touch === 'touch-only' && !surfaceSupportsTouch(surface)) return false;
  return true;
}

export function lookupWidget(type: string): WidgetDef | undefined {
  return WIDGET_REGISTRY[type];
}

// Resolve the size to use for a widget in the add-widget picker (both for the
// preview tile and for the size at which the widget is inserted on click).
// Honors an explicit `pickerSize` override; otherwise picks the smallest
// sensible size from the supported list - 2x2 if available, then 2x4, then
// 4x2, then 4x4. This keeps newly added widgets compact unless the widget can
// only render at a larger size.
export function sizesForSurface(meta: WidgetDef['meta'], surface?: PanelSurface): PanelWidgetSize[] {
  if (surface === 'q60' && meta.supportedSurfaces.includes('q60')) {
    return [...Q60_WIDGET_SIZES];
  }
  return [...meta.sizes];
}

export function pickerSizeFor(meta: WidgetDef['meta'], surface?: PanelSurface): PanelWidgetSize {
  const sizes = sizesForSurface(meta, surface);
  if (meta.pickerSize && sizes.includes(meta.pickerSize)) return meta.pickerSize;
  if (sizes.includes('2x2')) return '2x2';
  if (sizes.includes('2x4')) return '2x4';
  if (sizes.includes('4x2')) return '4x2';
  if (sizes.includes('4x4')) return '4x4';
  return meta.defaultSize;
}

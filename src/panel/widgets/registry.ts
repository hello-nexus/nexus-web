import { Boxes } from 'lucide-react';
import { MarketplaceWidget } from './marketplace/MarketplaceWidget';
import { MarketplaceWidgetSettings } from './marketplace/MarketplaceWidgetSettings';
import {
  getAllMarketplaceListings,
  getMarketplaceListing,
  isMarketplaceType,
  marketplaceIdFromType,
  typeForMarketplace,
} from '../../widgets/marketplaceRegistry';
import type { AppManifest } from './types';
import {
  SINGLE_WIDGET_SIZES,
  singleWidgetSurfaceSize,
  surfaceSupportsTouch,
  type PanelSurface,
  type PanelWidgetSize,
} from '../types';

// Per-app manifests live alongside the app's code. Each app folder
// exports its AppManifest from its `index.ts`; this file just
// aggregates them into the registry consumed by the panel engine.
import { clockApp } from './clock';
import { monitoringApp } from './monitoring';
import { mediaApp } from './media';
import { screentimeApp } from './screentime';
import { lightingApp } from './lighting';
import { obsApp } from './obs';
import { steamApp } from './steam';
import { discordApp } from './discord';
import { coolingApp } from './cooling';
import { devicesApp } from './devices';
import { displaysApp } from './displays';
import { timerApp } from './timer';
import { stopwatchApp } from './stopwatch';
import { calculatorApp } from './calculator';
import { iframeApp } from './iframe';
import { twitchApp } from './twitch';
import { macrosApp } from './macros';
import { snakeApp } from './snake';
import { blocksApp } from './blocks';
import { aquariumApp } from './aquarium';
import { whiteboardApp } from './whiteboard';
import { emojiApp } from './emoji';
import { galleryApp } from './gallery';

// Single source of truth for app type -> manifest. "App" is the
// conceptual unit (one per widget type); the manifest carries up to
// four facets: Widget (required), Page (desktop SPA), Touch (panel
// fullscreen), Settings (right-click sheet).
export const APP_REGISTRY: Record<string, AppManifest> = {
  clock:      clockApp,
  monitoring: monitoringApp,
  media:      mediaApp,
  screentime: screentimeApp,
  lighting:   lightingApp,
  obs:        obsApp,
  steam:      steamApp,
  discord:    discordApp,
  cooling:    coolingApp,
  devices:    devicesApp,
  displays:   displaysApp,
  timer:      timerApp,
  stopwatch:  stopwatchApp,
  calculator: calculatorApp,
  iframe:     iframeApp,
  twitch:     twitchApp,
  macros:     macrosApp,
  snake:      snakeApp,
  blocks:     blocksApp,
  aquarium:   aquariumApp,
  whiteboard: whiteboardApp,
  emoji:      emojiApp,
  gallery:    galleryApp,
};

// Whether an app can appear on a given surface. The decision is purely
// capability-based: the app's `touch` requirement vs the surface's
// input modality, and the app's `sizes` vs the surface's accepted
// sizes. No per-app surface allowlist — desktop (mouse), Y70 (touch),
// and phone (touch) all expose a pointer and accept every app whose
// sizes match. Single-widget surfaces (Q60) lock to one size and
// additionally exclude touch-required apps since they have no pointer.
export function appAvailableForSurface(meta: AppManifest['meta'], surface: PanelSurface): boolean {
  if (meta.touch && !surfaceSupportsTouch(surface)) return false;
  const single = singleWidgetSurfaceSize(surface);
  if (single !== undefined) {
    return meta.sizes.includes(single);
  }
  return meta.sizes.some(s => !SINGLE_WIDGET_SIZES.has(s));
}

export function lookupApp(type: string): AppManifest | undefined {
  if (isMarketplaceType(type)) {
    const id = marketplaceIdFromType(type);
    if (!id) return undefined;
    const listing = getMarketplaceListing(id);
    if (!listing) return undefined;
    return makeMarketplaceAppManifest(id, listing.name, listing.sizes, listing.defaultSize);
  }
  return APP_REGISTRY[type];
}

/**
 * Picker source. Returns every static app plus one synthetic entry
 * per installed marketplace app, keyed by `marketplace:<id>`. The Add
 * Widget catalog iterates this so external apps show up next to the
 * built-ins with the standard preview / drag / resize chrome - no
 * custom UI.
 */
export function getCatalogEntries(): Array<[string, AppManifest]> {
  const builtIns = Object.entries(APP_REGISTRY);
  const marketplace = getAllMarketplaceListings().map((listing): [string, AppManifest] => [
    typeForMarketplace(listing.id),
    makeMarketplaceAppManifest(listing.id, listing.name, listing.sizes, listing.defaultSize),
  ]);
  return [...builtIns, ...marketplace];
}

// Panel-engine sizes the marketplace synthetic AppManifest accepts.
// The manifest may declare any string here; anything outside this set
// falls through the filter so a typo can't crash the picker.
const VALID_MARKETPLACE_SIZES: ReadonlyArray<PanelWidgetSize> = ['1x1', '2x2', '4x2', '4x4'];

// Synthesise an AppManifest for a marketplace app. Sizes come from
// the listing's manifest so a 1x1 macros app stays 1x1 and a 4x2-only
// weather stays 4x2. Anything the manifest declares that the panel
// engine doesn't know about is filtered out.
function makeMarketplaceAppManifest(
  id: string,
  label: string,
  manifestSizes: string[] | undefined,
  manifestDefault: string | undefined,
): AppManifest {
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
    Widget: MarketplaceWidget,
    Settings: MarketplaceWidgetSettings,
  };
}

// Allowed sizes for an app on a given surface.
//
// Single-widget surfaces lock to one size: return [singleSize] when the
// app supports it (and is input-compatible), else [].
//
// Multi-widget surfaces hide any size reserved by a single-widget
// surface (e.g. 2x4 belongs to q60; everywhere else doesn't see it).
// The reconciler snaps existing widgets at a hidden size to the nearest
// non-reserved size on load.
export function sizesForSurface(meta: AppManifest['meta'], surface?: PanelSurface): PanelWidgetSize[] {
  if (!surface) return [...meta.sizes];
  if (meta.touch && !surfaceSupportsTouch(surface)) return [];
  const single = singleWidgetSurfaceSize(surface);
  if (single !== undefined) {
    return meta.sizes.includes(single) ? [single] : [];
  }
  return meta.sizes.filter(s => !SINGLE_WIDGET_SIZES.has(s));
}

// Size to use in the add-widget picker (preview + insertion size).
// Honors an explicit `pickerSize`; otherwise picks the smallest
// sensible — 1x1 then 2x2 then 4x2 then 4x4 — so newly added widgets
// stay compact.
//
// When the target surface is a single-widget surface (e.g. Q60 locked
// to 2x4), `sizesForSurface` already collapses to just that one entry.
// We short-circuit on that case so the locked size always wins,
// regardless of whether it appears in the small-first priority list
// — otherwise widgets fall through to meta.defaultSize, which is
// almost always wrong for that surface (e.g. Clock's 4x2 default
// rendering as a wide tile in a 2x4-locked catalog).
export function pickerSizeFor(meta: AppManifest['meta'], surface?: PanelSurface): PanelWidgetSize {
  const sizes = sizesForSurface(meta, surface);
  if (surface && singleWidgetSurfaceSize(surface) && sizes.length > 0) {
    return sizes[0];
  }
  if (meta.pickerSize && sizes.includes(meta.pickerSize)) return meta.pickerSize;
  if (sizes.includes('1x1')) return '1x1';
  if (sizes.includes('2x2')) return '2x2';
  if (sizes.includes('4x2')) return '4x2';
  if (sizes.includes('4x4')) return '4x4';
  return meta.defaultSize;
}

// ── Back-compat aliases ────────────────────────────────────────────────
// External code may still reference the old names; these aliases keep
// existing consumers working while the rename rolls out. New code
// should import the new names directly.
export const WIDGET_REGISTRY = APP_REGISTRY;
export const lookupWidget = lookupApp;
export const widgetAvailableForSurface = appAvailableForSurface;

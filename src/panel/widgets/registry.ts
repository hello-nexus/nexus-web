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
// exports its AppManifest from its `index.ts`; this file aggregates
// them into the registry consumed by the panel engine.
import { clockApp } from './clock';
import { monitoringApp } from './monitoring';
import { mediaApp } from './media';
import { screentimeApp } from './screentime';
import { lightingApp } from './lighting';
import { smartLightsApp } from './smart-lights';
import { obsApp } from './obs';
import { steamApp } from './steam';
import { discordApp } from './discord';
import { coolingApp } from './cooling';
import { displaysApp } from './displays';
import { timerApp } from './timer';
import { stopwatchApp } from './stopwatch';
import { calculatorApp } from './calculator';
import { iframeApp } from './iframe';
import { twitchApp } from './twitch';
import { macrosApp } from './macros';
import { emojiApp } from './emoji';
import { galleryApp } from './gallery';
import { pairingApp } from './pairing';

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
  'smart-lights': smartLightsApp,
  obs:        obsApp,
  steam:      steamApp,
  discord:    discordApp,
  cooling:    coolingApp,
  displays:   displaysApp,
  timer:      timerApp,
  stopwatch:  stopwatchApp,
  calculator: calculatorApp,
  iframe:     iframeApp,
  twitch:     twitchApp,
  macros:     macrosApp,
  emoji:      emojiApp,
  gallery:    galleryApp,
  pairing:    pairingApp,
};

// Whether an app can appear on a given surface. The decision is purely
// capability-based: the app's `touch` requirement vs the surface's
// input modality, and the app's `sizes` vs the surface's accepted
// sizes. No per-app surface allowlist — desktop (mouse), Y70 (touch),
// and phone (touch) all expose a pointer and accept every app whose
// sizes match. Single-widget surfaces (Q60) lock to one size and
// additionally exclude touch-required apps since they have no pointer.
export function appAvailableForSurface(
  meta: AppManifest['meta'],
  surface: PanelSurface,
  opts?: { remote?: boolean },
): boolean {
  if (meta.touch && !surfaceSupportsTouch(surface)) return false;
  // Local-only widgets (e.g. the pairing QR) are hidden on remotely-connected
  // panels — a remote panel is the thing being paired, not the pairer.
  if (meta.localOnly && opts?.remote) return false;
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

// Size for the add-widget picker (preview + insertion size). An explicit
// `pickerSize` wins; otherwise the larger of the common 2x2/4x2 pair (4x2),
// falling back to a widget's sole supported size (4x4 / 2x2 / 1x1). This
// drives the variable-size catalog tiles. Single-widget surfaces (Q60,
// locked to 2x4) short-circuit: `sizesForSurface` already collapsed to the
// one allowed size.
export function pickerSizeFor(meta: AppManifest['meta'], surface?: PanelSurface): PanelWidgetSize {
  const sizes = sizesForSurface(meta, surface);
  if (surface && singleWidgetSurfaceSize(surface) && sizes.length > 0) {
    return sizes[0];
  }
  if (meta.pickerSize && sizes.includes(meta.pickerSize)) return meta.pickerSize;
  if (sizes.includes('4x2')) return '4x2';
  if (sizes.length === 1) return sizes[0];
  // Mixed sizes without 4x2 (e.g. 2x2 + 4x4) — no current widget produces
  // this; prefer the larger as a defensive default.
  if (sizes.includes('4x4')) return '4x4';
  if (sizes.includes('2x2')) return '2x2';
  return meta.defaultSize;
}


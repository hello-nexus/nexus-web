import { Boxes } from 'lucide-react';
import { MarketplaceWidget } from './marketplace/MarketplaceWidget';
import { MarketplaceWidgetSettings } from './marketplace/MarketplaceWidgetSettings';
import { SdkMarketplacePage } from './marketplace/SdkMarketplacePage';
import {
  getAllMarketplaceListings,
  getMarketplaceListing,
  isMarketplaceIdEnabled,
  isMarketplaceType,
  marketplaceIdFromType,
  typeForMarketplace,
} from '../../widgets/marketplaceRegistry';
import { makeWidgetTouchView } from './common/WidgetTouchView';
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
import { calendarApp } from './calendar';
import { monitoringApp } from './monitoring';
import { mediaApp } from './media';
import { mixerApp } from './mixer';
import { weatherApp } from './weather';
import { stocksApp } from './stocks';
import { screentimeApp } from './screentime';
import { lightingApp } from './lighting';
import { smartLightsApp } from './smart-lights';
import { obsApp } from './obs';
import { steamApp } from './steam';
import { coolingApp } from './cooling';
import { displaysApp } from './displays';
import { timerApp } from './timer';
import { stopwatchApp } from './stopwatch';
import { calculatorApp } from './calculator';
import { twitchApp } from './twitch';
import { deckApp } from './deck';
import { emojiApp } from './emoji';
import { galleryApp } from './gallery';
import { transferApp } from './transfer';
import { cameraApp } from './camera';
import { benchmarkApp } from './benchmark';
import { homeAssistantApp } from './home-assistant';
import { diagnosticsApp } from './diagnostics';
import { snakeApp } from './snake';
import { blocksApp } from './blocks';
import { whiteboardApp } from './whiteboard';
import { processesApp } from './processes';

// Single source of truth for app type -> manifest. "App" is the
// conceptual unit (one per widget type); the manifest carries up to
// four facets: Widget (required), Page (desktop SPA), Touch (panel
// fullscreen), Settings (right-click sheet).
export const APP_REGISTRY: Record<string, AppManifest> = {
  clock:      clockApp,
  calendar:   calendarApp,
  monitoring: monitoringApp,
  media:      mediaApp,
  mixer:      mixerApp,
  weather:    weatherApp,
  stocks:     stocksApp,
  screentime: screentimeApp,
  lighting:   lightingApp,
  'smart-lights': smartLightsApp,
  'home-assistant': homeAssistantApp,
  obs:        obsApp,
  steam:      steamApp,
  cooling:    coolingApp,
  displays:   displaysApp,
  timer:      timerApp,
  stopwatch:  stopwatchApp,
  calculator: calculatorApp,
  twitch:     twitchApp,
  deck:       deckApp,
  emoji:      emojiApp,
  gallery:    galleryApp,
  transfer:   transferApp,
  camera:     cameraApp,
  benchmark:  benchmarkApp,
  diagnostics: diagnosticsApp,
  snake:      snakeApp,
  blocks:     blocksApp,
  whiteboard: whiteboardApp,
  processes:  processesApp,
};

// Whether an app can appear on a given surface. The decision is
// capability-based: the app's `touch` requirement vs the surface's
// input modality, the app's `sizes` vs the surface's accepted sizes,
// and the reach flags (`localOnly`/`remoteOnly`/`panelOnly`) an app
// opts into. There is no per-app surface allowlist beyond those flags:
// desktop (mouse), Y70 (touch), and phone (touch) all expose a pointer
// and accept every app whose sizes match. Single-widget surfaces (Q60)
// lock to one size and additionally exclude touch-required apps since
// they have no pointer.
export function appAvailableForSurface(
  meta: AppManifest['meta'],
  surface: PanelSurface,
  opts?: { remote?: boolean; deviceTouch?: boolean },
): boolean {
  if (meta.touch && !surfaceSupportsTouch(surface, opts?.deviceTouch)) return false;
  // The phone surface only exists on remotely-connected panels, so it doubles
  // as the remote default for callers that don't carry the flag (layout
  // reconcile, PanelApp's render filter).
  const remote = opts?.remote ?? (surface === 'phone');
  // Local-only widgets are hidden on remotely-connected panels: a remote panel
  // is the thing being paired, not the pairer.
  if (meta.localOnly && remote) return false;
  // Remote-only widgets (e.g. transfer) act on the host from a paired remote;
  // on the PC's own surfaces they have nothing to send to.
  if (meta.remoteOnly && !remote) return false;
  // Panel-only widgets (games) are driven entirely from their fullscreen Touch
  // view, which the desktop surface never opens - see meta.panelOnly.
  if (meta.panelOnly && surface === 'desktop') return false;
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
    return makeMarketplaceAppManifest(
      id, listing.name, listing.sizes, listing.defaultSize, !!listing.page,
      !!listing.immersive, !!listing.singleInstance,
    );
  }
  return APP_REGISTRY[type];
}

/**
 * Picker source. Returns every static app plus one synthetic entry
 * per installed marketplace app, keyed by `app:<id>`. The Add
 * Widget catalog iterates this so external apps show up next to the
 * built-ins with the standard preview / drag / resize chrome - no
 * custom UI.
 */
export function getCatalogEntries(): Array<[string, AppManifest]> {
  const builtIns = Object.entries(APP_REGISTRY);
  const marketplace = getAllMarketplaceListings().map((listing): [string, AppManifest] => [
    typeForMarketplace(listing.id),
    makeMarketplaceAppManifest(
      listing.id, listing.name, listing.sizes, listing.defaultSize, !!listing.page,
      !!listing.immersive, !!listing.singleInstance,
    ),
  ]);
  return [...builtIns, ...marketplace];
}

// Panel-engine sizes the marketplace synthetic AppManifest accepts.
// The manifest may declare any string here; anything outside this set
// falls through the filter so a typo can't crash the picker.
const VALID_MARKETPLACE_SIZES: ReadonlyArray<PanelWidgetSize> = ['1x1', '2x2', '4x2', '4x4'];

// One shared immersive adapter for every SDK app: makeWidgetTouchView returns a
// new component per call, so building it inline would remount the sandbox on
// each render.
const MARKETPLACE_TOUCH = makeWidgetTouchView(MarketplaceWidget);

// Native-style catalog faces for specific SDK apps. The picker renders this in
// place of the live sandbox load (MarketplaceWidget) so the tile shows a real
// preview instead of a blank sandbox load. Empty until an SDK app without a
// native built-in equivalent needs one; the mechanism stays wired for that case.
const MARKETPLACE_PREVIEWS: Record<string, AppManifest['Preview']> = {};

// Synthesise an AppManifest for a marketplace app. Sizes come from
// the listing's manifest so a 1x1 app stays 1x1 and a 4x2-only
// weather stays 4x2. Anything the manifest declares that the panel
// engine doesn't know about is filtered out.
function makeMarketplaceAppManifest(
  id: string,
  label: string,
  manifestSizes: string[] | undefined,
  manifestDefault: string | undefined,
  hasPage: boolean,
  immersive = false,
  singleInstance = false,
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
      // Opt-in per app: the immersive view re-renders the same widget at the
      // panel's full size, which only suits an app that lays out from useSize().
      supportsImmersive: { portrait: immersive, landscape: immersive },
      singleInstance,
      hasConfig: true,
      touch: false,
      // Marketplace curation runs through the same flag as built-ins: only
      // allowlisted SDK apps are listed in the picker; an installed-but-unlisted
      // one stays resolvable (placed instances render) but is delisted.
      listed: isMarketplaceIdEnabled(id),
    },
    Widget: MarketplaceWidget,
    // The immersive view is the same widget at full size - the SDK app already
    // lays out from useSize(), so it needs nothing of its own. Gated on the
    // manifest flag, since a widget that ignores its size reads as a stretched
    // cell rather than a fullscreen view.
    Touch: immersive ? MARKETPLACE_TOUCH : undefined,
    Preview: MARKETPLACE_PREVIEWS[id],
    // A page-capable SDK widget becomes click-through into a desktop section
    // view (Dashboard.renderSystemView). The wrapper reads the marketplace type
    // from its props and spawns the bundle's page surface.
    Page: hasPage ? SdkMarketplacePage : undefined,
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
export function sizesForSurface(meta: AppManifest['meta'], surface?: PanelSurface, deviceTouch?: boolean): PanelWidgetSize[] {
  if (!surface) return [...meta.sizes];
  if (meta.touch && !surfaceSupportsTouch(surface, deviceTouch)) return [];
  if (meta.panelOnly && surface === 'desktop') return [];
  const single = singleWidgetSurfaceSize(surface);
  if (single !== undefined) {
    return meta.sizes.includes(single) ? [single] : [];
  }
  return meta.sizes.filter(s => !SINGLE_WIDGET_SIZES.has(s));
}

// Fallback size for the add-widget picker (preview + insertion size), used
// when the catalog's browse-size preference isn't among the widget's sizes
// for the surface: the larger of the common 2x2/4x2 pair (4x2), falling
// back to a widget's sole supported size (4x4 / 2x2 / 1x1). Single-widget
// surfaces (Q60, locked to 2x4) short-circuit: `sizesForSurface` already
// collapsed to the one allowed size.
export function pickerSizeFor(meta: AppManifest['meta'], surface?: PanelSurface, deviceTouch?: boolean): PanelWidgetSize {
  const sizes = sizesForSurface(meta, surface, deviceTouch);
  if (surface && singleWidgetSurfaceSize(surface) && sizes.length > 0) {
    return sizes[0];
  }
  if (sizes.includes('4x2')) return '4x2';
  if (sizes.length === 1) return sizes[0];
  // Mixed sizes without 4x2 (e.g. 2x2 + 4x4) - no current widget produces
  // this; prefer the larger as a defensive default.
  if (sizes.includes('4x4')) return '4x4';
  if (sizes.includes('2x2')) return '2x2';
  return meta.defaultSize;
}


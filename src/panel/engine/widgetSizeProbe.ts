// Test support: resolves a stored Widget size to the layout a panel draws, through the same
// chain the kiosk uses (record size, layout surface, density, forced axis, grid capacity). It
// imports only what exists on both sides of the Widget scale work, so one file records the
// baseline fixture from an older checkout and replays it against the current code.

import { recordWidgetSizeOf } from './recordWidgetSize';
import { DEFAULT_SURFACE_DPI, densityShortSideSlots, estimateRuntimePanelDpi } from './panelGrid';
import { PANEL_WIDGET_PADDING_DEFAULT_PERCENT, panelGridCapacityForCanvas, panelWidgetPaddingRatio } from './grid';
import { getPanelGridSizingSettings } from '../../lib/panelSimulation';
import {
  forcedGridOf,
  panelLayoutDpi,
  panelLayoutSurface,
  panelShortSideSlots,
  type PanelSurface,
} from '../types';

export interface ProbeCase {
  id: string;
  surface: PanelSurface;
  family?: string;
  // Kiosk viewport in CSS px.
  width: number;
  height: number;
  dpr: number;
  // Record capabilities.dpi, when the device stamps one.
  dpi?: number;
  displayId?: string;
  gridSlots?: number;
}

export interface ProbeResult {
  size: string | null;
  layoutSurface: string;
  dpi: number | null;
  densitySlots: number;
  shortSideSlots: number | null;
  forced: { slots: number; landscape: boolean } | null;
  columns: number;
  rows: number;
  cellSize: number;
  rowSize: number;
  contentScale: number;
  gap: number;
  padding: number;
  contentGap: number;
  contentColumns: number;
  contentRows: number;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function probeLayout(c: ProbeCase, stored: string | undefined): ProbeResult {
  const record = {
    widgetSize: stored as never,
    gridSlots: c.gridSlots,
    displayId: c.displayId,
    kioskViewport: { cssWidth: c.width, cssHeight: c.height, dpr: c.dpr },
    capabilities: { family: c.family, cssWidth: c.width, cssHeight: c.height, dpr: c.dpr, dpi: c.dpi },
  };
  const size = recordWidgetSizeOf(record, c.surface);
  const surface = panelLayoutSurface(c.surface, c.family, size);
  const dpi = panelLayoutDpi(c.surface, c.family, size, c.dpi, DEFAULT_SURFACE_DPI);
  const densitySlots = densityShortSideSlots(c.width, c.height, c.dpr, dpi ?? estimateRuntimePanelDpi(surface));
  const shortSideSlots = panelShortSideSlots(c.surface, c.family, size, densitySlots);
  const w = Math.max(1, Math.round(c.width * c.dpr));
  const h = Math.max(1, Math.round(c.height * c.dpr));
  const cap = panelGridCapacityForCanvas(w, h, {
    surface,
    dpi: dpi ?? estimateRuntimePanelDpi(surface),
    sizing: getPanelGridSizingSettings(),
    shortSideSlots,
    paddingRatio: panelWidgetPaddingRatio(PANEL_WIDGET_PADDING_DEFAULT_PERCENT),
  });
  const forced = forcedGridOf(shortSideSlots, cap.columns > cap.rows);
  return {
    size: size ?? null,
    layoutSurface: surface,
    dpi: dpi ?? null,
    densitySlots,
    shortSideSlots: shortSideSlots ?? null,
    forced: forced ?? null,
    columns: cap.columns,
    rows: cap.rows,
    cellSize: round(cap.cellSize),
    rowSize: round(cap.rowSize),
    contentScale: round(cap.contentScale),
    gap: round(cap.gap),
    padding: round(cap.padding),
    contentGap: round(cap.contentGap),
    contentColumns: cap.contentColumns,
    contentRows: cap.contentRows,
  };
}

// Every value a record could hold: nothing, the three sizes the picker wrote, and one it never wrote.
export const PROBE_STORED: ReadonlyArray<string | undefined> = [undefined, 'large', 'small', 'xsmall', 'bogus'];

const gen = (id: string, width: number, height: number, dpr: number, extra: Partial<ProbeCase> = {}): ProbeCase =>
  ({ id, surface: 'monitor', width, height, dpr, ...extra });

export const PROBE_CASES: readonly ProbeCase[] = [
  { id: 'y70-portrait', surface: 'y70', width: 682, height: 2560, dpr: 1 },
  { id: 'y70-portrait-dpr15', surface: 'y70', width: 455, height: 1707, dpr: 1.5 },
  { id: 'y70-landscape', surface: 'y70', width: 2560, height: 682, dpr: 1 },
  { id: 'y70-dpi337', surface: 'y70', width: 682, height: 2560, dpr: 1, dpi: 337 },
  { id: 'q60', surface: 'q60', width: 480, height: 1920, dpr: 1 },
  { id: 'q60-dpi', surface: 'q60', width: 480, height: 1920, dpr: 1, dpi: 220 },
  { id: 'q60-alt', surface: 'q60', width: 360, height: 1280, dpr: 1 },
  { id: 'icue-lcd5', surface: 'monitor', family: 'icue-link-lcd5', width: 720, height: 1280, dpr: 1 },
  { id: 'icue-lcd5-dpi', surface: 'monitor', family: 'icue-link-lcd5', width: 720, height: 1280, dpr: 1, dpi: 300 },
  { id: 'icue-lcd5-land', surface: 'monitor', family: 'icue-link-lcd5', width: 1280, height: 720, dpr: 1 },
  { id: 'hydroshift2', surface: 'lcd-wide', family: 'lianli-hydroshift2-curve', width: 1280, height: 480, dpr: 1 },
  { id: 'hydroshift2-dpi', surface: 'lcd-wide', family: 'lianli-hydroshift2-curve', width: 1280, height: 480, dpr: 1, dpi: 379 },
  { id: 'asus-glacial', surface: 'lcd-square', family: 'asus-glacial-lcd', width: 480, height: 480, dpr: 1 },
  { id: 'asus-glacial-dpi', surface: 'lcd-square', family: 'asus-glacial-lcd', width: 480, height: 480, dpr: 1, dpi: 260 },
  { id: 'lianli-88-land', surface: 'monitor', family: 'lianli-screen88', width: 1920, height: 480, dpr: 1 },
  { id: 'lianli-88-port', surface: 'monitor', family: 'lianli-screen88', width: 480, height: 1920, dpr: 1 },
  { id: 'lianli-88-dpi', surface: 'monitor', family: 'lianli-screen88', width: 1920, height: 480, dpr: 1, dpi: 220 },
  { id: 'lianli-88-dpi-port', surface: 'monitor', family: 'lianli-screen88', width: 480, height: 1920, dpr: 1, dpi: 220 },
  { id: 'hyte-y60-land', surface: 'monitor', family: 'hyte-y60', width: 1920, height: 480, dpr: 1 },
  { id: 'hyte-y60-port', surface: 'monitor', family: 'hyte-y60', width: 480, height: 1920, dpr: 1 },
  { id: 'hyte-y60-dpi', surface: 'monitor', family: 'hyte-y60', width: 480, height: 1920, dpr: 1, dpi: 180 },
  { id: 'kraken', surface: 'lcd-round', family: 'nzxt-kraken', width: 640, height: 640, dpr: 1, dpi: 240 },
  { id: 'lcd-wide-plain', surface: 'lcd-wide', width: 1280, height: 480, dpr: 1 },
  { id: 'lcd-square-plain', surface: 'lcd-square', width: 480, height: 480, dpr: 1 },
  { id: 'monitor-other-family', surface: 'monitor', family: 'other-vendor', width: 1920, height: 480, dpr: 1 },
  { id: 'phone', surface: 'phone', width: 390, height: 844, dpr: 3, dpi: 460 },
  { id: 'phone-land', surface: 'phone', width: 844, height: 390, dpr: 3, dpi: 460 },
  { id: 'tablet', surface: 'phone', width: 820, height: 1180, dpr: 2, dpi: 264 },
  { id: 'desktop', surface: 'desktop', width: 1440, height: 900, dpr: 1 },
  gen('gen-1080p', 1920, 1080, 1),
  gen('gen-1080p-dpr125', 1536, 864, 1.25),
  gen('gen-1440p', 2560, 1440, 1),
  gen('gen-1440p-dpr15', 1707, 960, 1.5),
  gen('gen-4k', 3840, 2160, 1),
  gen('gen-4k-dpr15', 2560, 1440, 1.5),
  gen('gen-4k-dpr2', 1920, 1080, 2),
  gen('gen-768p', 1366, 768, 1),
  gen('gen-ultrawide', 3440, 1440, 1),
  gen('gen-superwide', 5120, 1440, 1),
  gen('gen-portrait-1080', 1080, 1920, 1),
  gen('gen-portrait-1440', 1440, 2560, 1),
  gen('gen-portrait-4k-dpr15', 1440, 2560, 1.5),
  gen('gen-small-panel', 1024, 600, 1),
  gen('gen-small-panel-port', 600, 1024, 1),
  gen('gen-tiny-7in', 800, 480, 1),
  gen('gen-dpi96', 1920, 1080, 1, { dpi: 96 }),
  gen('gen-dpi163', 2560, 1440, 1, { dpi: 163 }),
  gen('gen-dpi220-port', 1440, 2560, 1, { dpi: 220 }),
  gen('gen-dpi300', 3840, 2160, 1, { dpi: 300 }),
  gen('gen-dpi110-4k', 3840, 2160, 1, { dpi: 110 }),
];

// Retired grid densities a plain display record can still carry with no stored size.
export const PROBE_LEGACY_GRID_SLOTS: readonly number[] = [2, 4, 6, 8, 10, 12, 14, 16, 3, 5, 7];
export const PROBE_LEGACY_CASES: readonly ProbeCase[] = PROBE_CASES
  .filter(c => c.id.startsWith('gen-'))
  .flatMap(c => PROBE_LEGACY_GRID_SLOTS.map(slots => ({ ...c, id: `${c.id}|slots${slots}`, displayId: 'display-1', gridSlots: slots })));

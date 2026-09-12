import type { PanelSurface } from '../panel/types';
import {
  DEFAULT_PANEL_GRID_SHORT_SIDE_JUMP_INCHES,
  panelGridCapacityForCanvas,
  panelPhysicalSize,
  type PanelGridCapacity,
} from '../panel/engine/grid';
import { DEV_TOOLS } from './devTools';

const SIMULATE_Y70_KEY = 'nexus_simulate_y70';
const SIMULATED_PANEL_IDS_KEY = 'nexus_simulated_panel_ids';
const SIMULATED_PANEL_CUSTOM_KEY = 'nexus_simulated_panel_custom';
const SIMULATED_PANEL_GRID_SIZING_KEY = 'nexus_simulated_panel_grid_sizing';

export const PANEL_SIMULATION_CHANGED_EVENT = 'y70-simulate-changed';

export interface SimulatedPanelDefinition {
  id: string;
  name: string;
  surface: PanelSurface;
  width: number;
  height: number;
  dpi: number;
}

export interface PanelPhysicalSize {
  widthInches: number;
  heightInches: number;
  shortSideInches: number;
  diagonalInches: number;
}

export interface SimulatedPanelGridSizing {
  shortSideJumpAtInches: number;
}

export const SIMULATED_PANEL_PRESETS: readonly SimulatedPanelDefinition[] = [
  // Two Y70 touch variants. Simulator names carry the resolution class to
  // disambiguate them in the sidebar / picker; a real connected Y70 is just
  // "HYTE Y70 Touch" (see CURATED_SHORT_NAMES in useUnifiedDevices).
  { id: 'y70',    name: 'HYTE Y70 Touch 2.5K', surface: 'y70', width: 682,  height: 2560, dpi: 337 },
  { id: 'y70-4k', name: 'HYTE Y70 Touch 4K',   surface: 'y70', width: 1100, height: 3840, dpi: 283 },
  { id: 'q60', name: 'HYTE Q60', surface: 'q60', width: 720, height: 1280, dpi: 220 },
  // NZXT Kraken LCD: 2.36" 640x640 round glass, one tile. Matches the streamed
  // record KrakenPanelDiscovery reports (640x640 @ dpr 1).
  { id: 'kraken', name: 'NZXT Kraken LCD', surface: 'kraken', width: 640, height: 640, dpi: 271 },
  // Cooler LCDs fed pushed JPEG frames. One preset per distinct panel geometry rather
  // than per model: 'lcd-round' at 480 covers the Galahad II LCD and the Corsair XC7,
  // and the Elite Capellix is the same glass without the circular mask.
  { id: 'lcd-round-480', name: 'Cooler LCD 480 Round', surface: 'lcd-round', width: 480, height: 480, dpi: 210 },
  { id: 'lcd-square-480', name: 'Cooler LCD 480', surface: 'lcd-square', width: 480, height: 480, dpi: 210 },
  { id: 'lcd-wide-1600', name: 'Cooler LCD 1600 Wide', surface: 'lcd-wide', width: 1600, height: 720, dpi: 210 },
  { id: 'lcd-round-240', name: 'Cooler LCD 240 Round', surface: 'lcd-round', width: 240, height: 240, dpi: 160 },
  // Corsair Xeneon Edge 14.5" 2560x720 strip; rides the promoted-monitor
  // surface (a real one registers via POST /displays/{id}/panel).
  { id: 'xeneon-edge', name: 'Xeneon Edge', surface: 'monitor', width: 2560, height: 720, dpi: 183 },
  { id: 'phone', name: 'Phone Panel', surface: 'phone', width: 1206, height: 2622, dpi: 460 },
  { id: 'tablet', name: 'Tablet Panel', surface: 'phone', width: 1640, height: 2360, dpi: 264 },
];

export const DEFAULT_SIMULATED_PANEL_GRID_SIZING: SimulatedPanelGridSizing = {
  shortSideJumpAtInches: DEFAULT_PANEL_GRID_SHORT_SIDE_JUMP_INCHES,
};

// Native pixels, like every other entry in this table. The previous default
// was 734x1707: 734 is the 4K panel's CSS width (1100/1.5) and 1707 the 2.5K's
// CSS height (2560/1.5), so two CSS-space numbers from two different panels sat
// in a native-pixel field and were divided by the DPR a second time. That
// rendered at aspect 0.43 against a real Y70's 0.27 - visibly squat. The dpi
// here has always been the 2.5K's, so that is the panel this meant to describe.
const DEFAULT_CUSTOM_PANEL: SimulatedPanelDefinition = {
  id: 'custom',
  name: 'Custom Panel',
  surface: 'y70',
  width: 682,
  height: 2560,
  dpi: 337,
};

function clampDimension(value: number, fallback: number): number {
  return Number.isFinite(value)
    ? Math.max(240, Math.min(4096, Math.round(value)))
    : fallback;
}

function clampDpi(value: number, fallback: number): number {
  return Number.isFinite(value)
    ? Math.max(72, Math.min(600, Math.round(value)))
    : fallback;
}

function clampJumpAtInches(value: number, fallback: number): number {
  return Number.isFinite(value)
    ? Math.max(1, Math.min(16, Math.round(value * 10) / 10))
    : fallback;
}

function inferPanelSurface(width: number, height: number, dpi: number): PanelSurface {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const aspect = shortSide / longSide;
  if (Math.abs(aspect - 9 / 16) < 0.04 && shortSide <= 900 && longSide <= 1500) return 'q60';
  if (dpi >= 240 || shortSide >= 900) return 'phone';
  return 'y70';
}

function dispatchSimulationChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PANEL_SIMULATION_CHANGED_EVENT));
}

function readJson<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readConnectedIds(): string[] {
  const rawIds = readJson<unknown>(SIMULATED_PANEL_IDS_KEY, []);
  const ids = Array.isArray(rawIds)
    ? rawIds.filter((id): id is string => typeof id === 'string')
    : [];
  try {
    if (typeof localStorage === 'undefined') return ids;
    if (localStorage.getItem(SIMULATE_Y70_KEY) === '1' && !ids.includes('y70')) {
      return [...ids, 'y70'];
    }
  } catch {
    // Ignore storage errors and use the parsed IDs.
  }
  return ids;
}

function writeConnectedIds(ids: string[]): void {
  if (typeof localStorage === 'undefined') return;
  const unique = [...new Set(ids)];
  localStorage.setItem(SIMULATED_PANEL_IDS_KEY, JSON.stringify(unique));
  localStorage.setItem(SIMULATE_Y70_KEY, unique.includes('y70') ? '1' : '0');
}

export function getCustomSimulatedPanel(): SimulatedPanelDefinition {
  const saved = readJson<Partial<SimulatedPanelDefinition>>(SIMULATED_PANEL_CUSTOM_KEY, {});
  const width = typeof saved.width === 'number' && Number.isFinite(saved.width)
    ? clampDimension(saved.width, DEFAULT_CUSTOM_PANEL.width)
    : DEFAULT_CUSTOM_PANEL.width;
  const height = typeof saved.height === 'number' && Number.isFinite(saved.height)
    ? clampDimension(saved.height, DEFAULT_CUSTOM_PANEL.height)
    : DEFAULT_CUSTOM_PANEL.height;
  const dpi = typeof saved.dpi === 'number' && Number.isFinite(saved.dpi)
    ? clampDpi(saved.dpi, DEFAULT_CUSTOM_PANEL.dpi)
    : DEFAULT_CUSTOM_PANEL.dpi;
  const surface = inferPanelSurface(width, height, dpi);
  return { ...DEFAULT_CUSTOM_PANEL, width, height, dpi, surface };
}

export function getPanelGridSizingSettings(): SimulatedPanelGridSizing {
  const saved = readJson<Partial<SimulatedPanelGridSizing> & { jumpAtInches?: number }>(SIMULATED_PANEL_GRID_SIZING_KEY, {});
  const savedJumpAtInches = saved.shortSideJumpAtInches ?? saved.jumpAtInches;
  return {
    shortSideJumpAtInches: typeof savedJumpAtInches === 'number'
      ? clampJumpAtInches(savedJumpAtInches, DEFAULT_SIMULATED_PANEL_GRID_SIZING.shortSideJumpAtInches)
      : DEFAULT_SIMULATED_PANEL_GRID_SIZING.shortSideJumpAtInches,
  };
}

export function setPanelGridSizingSettings(settings: Partial<SimulatedPanelGridSizing>): void {
  const current = getPanelGridSizingSettings();
  const next: SimulatedPanelGridSizing = {
    shortSideJumpAtInches: clampJumpAtInches(
      settings.shortSideJumpAtInches ?? current.shortSideJumpAtInches,
      current.shortSideJumpAtInches,
    ),
  };
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SIMULATED_PANEL_GRID_SIZING_KEY, JSON.stringify(next));
  dispatchSimulationChanged();
}

export function setCustomSimulatedPanelSize(width: number, height: number, dpi = DEFAULT_CUSTOM_PANEL.dpi): void {
  const nextWidth = clampDimension(width, DEFAULT_CUSTOM_PANEL.width);
  const nextHeight = clampDimension(height, DEFAULT_CUSTOM_PANEL.height);
  const nextDpi = clampDpi(dpi, DEFAULT_CUSTOM_PANEL.dpi);
  const next: SimulatedPanelDefinition = {
    ...DEFAULT_CUSTOM_PANEL,
    width: nextWidth,
    height: nextHeight,
    dpi: nextDpi,
    surface: inferPanelSurface(nextWidth, nextHeight, nextDpi),
  };
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SIMULATED_PANEL_CUSTOM_KEY, JSON.stringify(next));
  dispatchSimulationChanged();
}

export function getAllSimulatedPanels(): SimulatedPanelDefinition[] {
  return [...SIMULATED_PANEL_PRESETS, getCustomSimulatedPanel()];
}

export function getSimulatedPanelDefinition(id: string): SimulatedPanelDefinition | undefined {
  return getAllSimulatedPanels().find(panel => panel.id === id);
}

export function getConnectedSimulatedPanelIds(): string[] {
  // Simulated panels are a dev-tools feature. A build without the dev tools
  // ignores any persisted selection, so a panel enabled in a dev build does
  // not stay stuck on after switching to a production build.
  if (!DEV_TOOLS) return [];
  return readConnectedIds().filter(id => getSimulatedPanelDefinition(id) !== undefined);
}

export function getConnectedSimulatedPanels(): SimulatedPanelDefinition[] {
  const ids = new Set(getConnectedSimulatedPanelIds());
  return getAllSimulatedPanels().filter(panel => ids.has(panel.id));
}

export function getSimulatedPanelGridCapacity(panel: SimulatedPanelDefinition): PanelGridCapacity {
  return panelGridCapacityForCanvas(panel.width, panel.height, {
    surface: panel.surface,
    dpi: panel.dpi,
    sizing: getPanelGridSizingSettings(),
  });
}

export function getSimulatedPanelPhysicalSize(panel: Pick<SimulatedPanelDefinition, 'width' | 'height' | 'dpi'>): PanelPhysicalSize {
  return panelPhysicalSize(panel.width, panel.height, panel.dpi);
}

export function formatPanelInches(inches: number): string {
  return `${inches.toFixed(1)} in`;
}

export function isSimulatedPanelConnected(id: string): boolean {
  return getConnectedSimulatedPanelIds().includes(id);
}

export function setSimulatedPanelConnected(id: string, connected: boolean): void {
  const ids = new Set(getConnectedSimulatedPanelIds());
  if (connected) ids.add(id);
  else ids.delete(id);
  writeConnectedIds([...ids]);
  dispatchSimulationChanged();
}

export function isY70Simulated(): boolean {
  return isSimulatedPanelConnected('y70');
}

export function setY70Simulated(next: boolean): void {
  setSimulatedPanelConnected('y70', next);
}

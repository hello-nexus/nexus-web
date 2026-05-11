import type { PanelLayout, PanelSurface } from '../panel/types';
import {
  DEFAULT_PANEL_GRID_SHORT_SIDE_JUMP_INCHES,
  panelGridCapacityForCanvas,
  panelPhysicalSize,
  type PanelGridCapacity,
} from '../panel/engine/grid';

const SIMULATE_Y70_KEY = 'qos_simulate_y70';
const SIMULATED_PANEL_IDS_KEY = 'qos_simulated_panel_ids';
const SIMULATED_PANEL_CUSTOM_KEY = 'qos_simulated_panel_custom';
const SIMULATED_PANEL_LAYOUT_PREFIX = 'qos_simulated_panel_layout:';
const SIMULATED_PANEL_GRID_SIZING_KEY = 'qos_simulated_panel_grid_sizing';

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
  { id: 'y70', name: 'Y70 Touch', surface: 'y70', width: 682, height: 2560, dpi: 337 },
  { id: 'q60', name: 'Q60 LCD', surface: 'q60', width: 720, height: 1280, dpi: 220 },
  { id: 'phone', name: 'Phone Panel', surface: 'phone', width: 1206, height: 2622, dpi: 460 },
  { id: 'tablet', name: 'Tablet Panel', surface: 'phone', width: 1640, height: 2360, dpi: 264 },
];

export const DEFAULT_SIMULATED_PANEL_GRID_SIZING: SimulatedPanelGridSizing = {
  shortSideJumpAtInches: DEFAULT_PANEL_GRID_SHORT_SIDE_JUMP_INCHES,
};

const DEFAULT_CUSTOM_PANEL: SimulatedPanelDefinition = {
  id: 'custom',
  name: 'Custom Panel',
  surface: 'y70',
  width: 734,
  height: 1707,
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

export function loadSimulatedPanelLayout(deviceId: string): PanelLayout | null {
  return readJson<PanelLayout | null>(`${SIMULATED_PANEL_LAYOUT_PREFIX}${deviceId}`, null);
}

export function saveSimulatedPanelLayout(deviceId: string, layout: PanelLayout): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(`${SIMULATED_PANEL_LAYOUT_PREFIX}${deviceId}`, JSON.stringify(layout));
}

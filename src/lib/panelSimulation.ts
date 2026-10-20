import { panelLayoutSurface, type PanelSurface } from '../panel/types';
import {
  DEFAULT_PANEL_GRID_SHORT_SIDE_JUMP_INCHES,
  panelGridCapacityForCanvas,
  panelPhysicalSize,
  type PanelGridCapacity,
} from '../panel/engine/grid';
import { DEV_TOOLS } from './devTools';
import { allocatePanelDevice, deletePanelDevice, fetchPanelDevices, patchPanelDevice } from '../api/panel';
import { defaultLayoutForSurface } from '../panel/engine/defaultLayout';
import {
  GENERIC_VENDOR,
  LEGACY_SIMULATED_SCREEN_IDS,
  SIMULATED_SCREEN_CATALOG,
} from './simulatedScreenCatalog';

const SIMULATE_Y70_KEY = 'nexus_simulate_y70';
const SIMULATED_PANEL_IDS_KEY = 'nexus_simulated_panel_ids';
const SIMULATED_PANEL_CUSTOM_KEY = 'nexus_simulated_panel_custom';
const SIMULATED_PANEL_GRID_SIZING_KEY = 'nexus_simulated_panel_grid_sizing';
const SIMULATED_PANEL_RECORDS_KEY = 'nexus_simulated_panel_records';

export const PANEL_SIMULATION_CHANGED_EVENT = 'y70-simulate-changed';

export interface SimulatedPanelDefinition {
  id: string;
  name: string;
  surface: PanelSurface;
  width: number;
  height: number;
  dpi: number;
  vendor?: string;
  family?: string;
  touch?: boolean;
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

export const SIMULATED_PANEL_PRESETS: readonly SimulatedPanelDefinition[] = SIMULATED_SCREEN_CATALOG;

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
  vendor: GENERIC_VENDOR,
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
    ? [...new Set(rawIds
      .filter((id): id is string => typeof id === 'string')
      .map(id => LEGACY_SIMULATED_SCREEN_IDS[id] ?? id))]
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
  const wasConnected = ids.has(id);
  if (connected) ids.add(id);
  else ids.delete(id);
  writeConnectedIds([...ids]);
  dispatchSimulationChanged();
  if (connected && !wasConnected && DEV_TOOLS) void ensureSimulatedPanelRecord(id);
  if (!connected) releaseSimulatedPanelRecord(id);
}

// A simulator owns one panel record of its own. It is allocated without a surface:
// the registry reuses a record per single-instance surface, and a surface-less
// record can never be matched by surface or reused by a real device.
function readRecordIds(): Record<string, string> {
  const raw = readJson<unknown>(SIMULATED_PANEL_RECORDS_KEY, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string' && v !== ''));
}

function writeRecordIds(map: Record<string, string>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SIMULATED_PANEL_RECORDS_KEY, JSON.stringify(map));
  } catch {
    // Storage unavailable; the record is re-allocated on the next edit.
  }
}

export function getSimulatedPanelRecordId(id: string): string | undefined {
  return readRecordIds()[id];
}

const pendingRecords = new Map<string, Promise<string | undefined>>();

/** Writes the layout a record of this simulator starts from; the service seeds a surface-less record's null layout with the Y70 starter on read. */
export async function persistSimulatorDefaultLayout(id: string, recordId: string): Promise<boolean> {
  const def = getSimulatedPanelDefinition(id);
  if (!def) return false;
  const layout = defaultLayoutForSurface(panelLayoutSurface(def.surface, def.family, null));
  return !!(await patchPanelDevice(recordId, { layout }).catch(() => null));
}

/** The record a simulator edits, allocated on first use. Undefined while the service is unreachable or the simulator is gone. */
export function ensureSimulatedPanelRecord(id: string): Promise<string | undefined> {
  const pending = pendingRecords.get(id);
  if (pending) return pending;
  const task = (async () => {
    const stored = getSimulatedPanelRecordId(id);
    if (stored) {
      // The list returns stored records as they are; a single GET seeds a null layout and hides it.
      const list = await fetchPanelDevices().catch(() => null);
      if (!list) return stored;
      const record = list.devices.find(d => d.id === stored);
      if (record) {
        if (!record.layout) await persistSimulatorDefaultLayout(id, stored);
        return stored;
      }
    }
    const name = getSimulatedPanelDefinition(id)?.name;
    const record = await allocatePanelDevice(undefined, name).catch(() => null);
    if (!record?.id) return undefined;
    // The id is published only once its default layout is stored, so no consumer can edit before it lands.
    if (isSimulatedPanelConnected(id)) await persistSimulatorDefaultLayout(id, record.id);
    if (!isSimulatedPanelConnected(id)) {
      void deletePanelDevice(record.id).catch(() => null);
      return undefined;
    }
    writeRecordIds({ ...readRecordIds(), [id]: record.id });
    dispatchSimulationChanged();
    return record.id;
  })().finally(() => { pendingRecords.delete(id); });
  pendingRecords.set(id, task);
  return task;
}

function releaseSimulatedPanelRecord(id: string): void {
  const map = readRecordIds();
  const recordId = map[id];
  if (!recordId) return;
  delete map[id];
  writeRecordIds(map);
  void deletePanelDevice(recordId).catch(() => null);
}

export function isY70Simulated(): boolean {
  return isSimulatedPanelConnected('y70');
}

export function setY70Simulated(next: boolean): void {
  setSimulatedPanelConnected('y70', next);
}

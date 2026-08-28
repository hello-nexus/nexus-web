import type { LightingDevice, StaticDeviceLookDto } from './lighting';

/**
 * Stand-in RGB hardware for a dev machine that has none, so the lighting page
 * can be driven end to end. Dev-tools builds only, and only while the service
 * reports no real devices - a box with hardware never sees these.
 */

const DEV_TOOLS = import.meta.env.DEV || __DEV_TOOLS__;
const LOOKS_KEY = 'nexus.dev.mockLightingLooks';

// Canvas coordinates are in the 1000x600 space DeviceCanvas lays out in.
const SPECS: [id: string, name: string, leds: number, hex: string, x: number, y: number, w: number, h: number][] = [
  ['mock-kb',    'AULA F75 Max',    82, '#ff2d55', 150, 420, 620, 150],
  ['mock-mouse', 'Nexus Mouse',      4, '#ff8a00', 800, 430, 90, 130],
  ['mock-gpu',   'RTX 5080 FE',     12, '#00e5ff', 280, 250, 460, 90],
  ['mock-ram1',  'DDR5 DIMM 1',      8, '#7c4dff', 150, 60, 40, 160],
  ['mock-ram2',  'DDR5 DIMM 2',      8, '#7c4dff', 205, 60, 40, 160],
  ['mock-aio',   'AIO Pump',        16, '#00e676', 300, 60, 190, 150],
  ['mock-fan1',  'Uni Fan SL 1',    20, '#ffd400', 540, 60, 120, 120],
  ['mock-fan2',  'Uni Fan SL 2',    20, '#ffd400', 675, 60, 120, 120],
  ['mock-fan3',  'Uni Fan SL 3',    20, '#ffd400', 810, 60, 120, 120],
  ['mock-strip', 'Case Strip',      60, '#ffffff', 40, 60, 40, 500],
  ['mock-pad',   'Mousepad',        34, '#8a7f6d', 800, 250, 160, 90],
  ['mock-mobo',  'Motherboard Trim', 6, '#ff00d4', 150, 350, 620, 40],
];

export const MOCK_LIGHTING_DEVICES: LightingDevice[] = SPECS.map(([id, name, ledCount, , x, y, w, h]) => ({
  id,
  name,
  type: 'mock',
  ledsOn: true,
  controlled: true,
  brightness: 100,
  ledCount,
  enabledLedCount: ledCount,
  deviceKey: '',
  canvasX: x,
  canvasY: y,
  canvasW: w,
  canvasH: h,
  canvasRotation: 0,
  deviceId: id,
  zoneCustomizable: false,
}));

const flatLook = (color: string): StaticDeviceLookDto => ({
  effect: 'flat', color, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, slot: 0,
});

let active = false;

/** Flipped by the device fetch: real hardware always wins. */
export function setMockLightingActive(on: boolean): void {
  active = DEV_TOOLS && on;
}

export function mockLightingActive(): boolean {
  return active;
}

function readLooks(): Record<string, StaticDeviceLookDto> {
  try {
    const raw = localStorage.getItem(LOOKS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, StaticDeviceLookDto>;
  } catch { /* fall through to the seeded set */ }
  return Object.fromEntries(SPECS.map(([id, , , hex]) => [id, flatLook(hex)]));
}

export function mockLightingLooks(): Record<string, StaticDeviceLookDto> {
  return readLooks();
}

/** Records what a pick would have written, so a reload shows the same colours. */
export function setMockLightingLook(id: string, look: StaticDeviceLookDto): void {
  const all = readLooks();
  all[id] = look;
  try {
    localStorage.setItem(LOOKS_KEY, JSON.stringify(all));
  } catch { /* quota or private mode - the picks stay in memory only */ }
}

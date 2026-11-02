import type { SystemSpecs } from '../../../hooks/useSystemSpecs';
import { shortBoard, shortCooler, shortCpu, shortGpu, shortRam, shortStorage } from './shortSpecs';

export type BuildSpecKey = 'cpu' | 'gpu' | 'ram' | 'storage' | 'motherboard' | 'cooler';

export interface BuildSpecRow {
  key: BuildSpecKey;
  /** The short label shown beside the value. */
  labelKey: string;
  /** The full type name, for the tooltip and assistive tech; an existing translation key. */
  fullKey: string;
  /** The family-level name the tile shows. */
  value: string;
  /** The reported string, for the tooltip. */
  full: string;
}

export interface BuildSpecInputs {
  specs: SystemSpecs | null;
  /** Detected CPU coolers, already named. */
  coolers: string[];
}

const FULL_KEYS: Record<BuildSpecKey, string> = {
  cpu: 'devices.specs.row.processor',
  gpu: 'devices.specs.row.graphicsCard',
  ram: 'devices.specs.row.memory',
  storage: 'devices.specs.row.storage',
  motherboard: 'devices.specs.row.motherboard',
  cooler: 'monitoring.detailed.cooler',
};

const LABEL_KEYS: Record<BuildSpecKey, string> = {
  cpu: 'panel.widget.build.spec.cpu',
  gpu: 'panel.widget.build.spec.gpu',
  ram: 'panel.widget.build.spec.ram',
  storage: 'panel.widget.build.spec.storage',
  motherboard: 'panel.widget.build.spec.motherboard',
  cooler: 'panel.widget.build.spec.cooler',
};

const KEYS_BY_SIZE: Record<string, BuildSpecKey[]> = {
  '4x2': ['cpu', 'gpu', 'ram'],
  '4x4': ['cpu', 'gpu', 'ram', 'storage', 'motherboard', 'cooler'],
};

/** Whether a tile of this size lists specs beside the image. */
export function sizeShowsSpecs(size: string): boolean {
  return size in KEYS_BY_SIZE;
}

/** The detected coolers as one name each: vendor and model, the vendor not repeated when the model already starts with it. */
export function coolerNames(devices: { category?: string; vendor?: string; model?: string }[]): string[] {
  const names = devices
    .filter((d) => d.category === 'cooler' && d.model)
    .map((d) => (d.vendor && !d.model!.toLowerCase().startsWith(d.vendor.toLowerCase()) ? `${d.vendor} ${d.model}` : d.model!));
  return Array.from(new Set(names));
}

/** The rows a tile of this size lists, in order; a spec the PC did not report has no row. */
export function buildSpecRows({ specs, coolers }: BuildSpecInputs, size: string): BuildSpecRow[] {
  const keys = KEYS_BY_SIZE[size];
  if (!keys || !specs) return [];
  const reported: Record<BuildSpecKey, string | undefined> = {
    cpu: specs.processor,
    gpu: specs.primaryGpu || specs.graphicsCard,
    ram: specs.memory,
    storage: specs.storage,
    motherboard: specs.motherboard,
    cooler: coolers.join(', '),
  };
  const short: Record<BuildSpecKey, (full: string) => string> = {
    cpu: shortCpu,
    gpu: shortGpu,
    ram: shortRam,
    storage: shortStorage,
    motherboard: shortBoard,
    cooler: (full) => full.split(', ').map(shortCooler).join(', '),
  };
  return keys.flatMap((key) => {
    const full = reported[key]?.trim();
    return full ? [{ key, labelKey: LABEL_KEYS[key], fullKey: FULL_KEYS[key], value: short[key](full), full }] : [];
  });
}

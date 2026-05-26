export type ComponentCategory =
  | 'cpu' | 'motherboard' | 'ram' | 'gpu'
  | 'storage' | 'psu' | 'cooler' | 'case' | 'monitor';

export const BUILDER_CATEGORIES: ComponentCategory[] = [
  'cpu', 'motherboard', 'ram', 'gpu', 'storage', 'psu', 'cooler', 'case',
];

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  cpu: 'Processor',
  motherboard: 'Motherboard',
  ram: 'Memory',
  gpu: 'Video Card',
  storage: 'Storage',
  psu: 'Power Supply',
  cooler: 'CPU Cooler',
  case: 'Case',
  monitor: 'Monitor',
};

export interface RetailerListing {
  slug: string;
  price: number | null;
  salePrice: number | null;
  inStock: boolean;
  url: string;
}

export interface ComponentOption {
  id: string;
  normalizedKey: string;
  title: string;
  type: ComponentCategory;
  brand: string | null;
  chip: string | null;
  imageUrl: string | null;
  bestPrice: number | null;
  retailers: RetailerListing[];
  // Specs are heterogeneous across categories (number for tdp, string for
  // socket, string[] for sockets, etc) and consumed by category-specific
  // column getters / formatters. Modeling each category's specs as a
  // discriminated union would propagate large refactors across the builder
  // codebase for no runtime benefit; keep as `any` so existing arithmetic
  // and string ops typecheck.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  specs: Record<string, any>;
}

export interface BuildSlotEntry {
  selection: ComponentOption | null;
  selectedRetailer: string | null;
}

export interface Build {
  schemaVersion: 1;
  id: string;
  name: string;
  slots: Record<ComponentCategory, BuildSlotEntry[]>;
  ownedSlots: ComponentCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface CatalogData {
  lastUpdated: string;
  retailers: Array<{ slug: string; name: string }>;
  components: Record<ComponentCategory, ComponentOption[]>;
}

export type CompatibilitySeverity = 'error' | 'warning' | 'info';

export interface CompatibilityIssue {
  severity: CompatibilitySeverity;
  category: ComponentCategory;
  relatedCategory?: ComponentCategory;
  message: string;
}

export interface WattageEstimate {
  components: Partial<Record<ComponentCategory, number>>;
  total: number;
  recommendedPsu: number;
  headroom: number | null;
}

// Mirrors the BuilderAction union defined in src/hooks/useBuilder.ts. Kept
// here so consumers that only need the dispatch shape don't have to import
// from the hook module (avoiding a circular dep and the `any` escape hatch).
export type BuilderAction =
  | { type: 'SELECT_COMPONENT'; category: ComponentCategory; index: number; component: ComponentOption; retailer?: string }
  | { type: 'REMOVE_COMPONENT'; category: ComponentCategory; index: number }
  | { type: 'ADD_SLOT'; category: ComponentCategory }
  | { type: 'REMOVE_SLOT'; category: ComponentCategory; index: number }
  | { type: 'TOGGLE_OWNED'; category: ComponentCategory }
  | { type: 'LOAD_BUILD'; build: Build }
  | { type: 'LOAD_OWNED_HARDWARE'; detected: Partial<Record<ComponentCategory, ComponentOption[]>> }
  | { type: 'CLEAR' };

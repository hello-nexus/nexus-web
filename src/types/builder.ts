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

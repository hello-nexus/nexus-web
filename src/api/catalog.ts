const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface CatalogSearchParams {
  q?: string;
  page?: number;
  limit?: number;
  sort?: string;
  sortDir?: 'asc' | 'desc';
  inStock?: boolean;
  checkboxes?: Record<string, string[]>;
  ranges?: Record<string, { min: string; max: string }>;
}

export interface FilterOption {
  value: string;
  count: number;
}

export interface CatalogSearchResult {
  // items are full ComponentOption rows shaped by the service; declared loose
  // here because src/api/* must not depend on src/types/* (this module is
  // imported by the shared catalog client).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  filters: Record<string, FilterOption[]>;
}

export async function searchCatalog(
  category: string,
  params: CatalogSearchParams,
): Promise<CatalogSearchResult> {
  const qs = new URLSearchParams();

  if (params.q) qs.set('q', params.q);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.sort) qs.set('sort', params.sort);
  if (params.sortDir) qs.set('sortDir', params.sortDir);
  if (params.inStock) qs.set('inStock', 'true');

  if (params.checkboxes) {
    for (const [key, values] of Object.entries(params.checkboxes)) {
      if (values.length > 0) qs.set(key, values.join(','));
    }
  }

  if (params.ranges) {
    for (const [key, range] of Object.entries(params.ranges)) {
      if (range.min !== '') qs.set(`${key}_min`, range.min);
      if (range.max !== '') qs.set(`${key}_max`, range.max);
    }
  }

  const res = await fetch(`${API_BASE}/catalog/${category}?${qs.toString()}`);
  if (!res.ok) throw new Error(`Catalog search failed: ${res.status}`);
  return res.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ComponentOption import would create a layering cycle
export async function fetchComponent(category: string, id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/catalog/${category}/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(`Component fetch failed: ${res.status}`);
  return res.json();
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { searchCatalog, type CatalogSearchResult, type CatalogSearchParams, type FilterOption } from '../api/catalog';
import type { ComponentCategory, ComponentOption } from '../types/builder';

interface UseComponentSearchResult {
  items: ComponentOption[];
  total: number;
  page: number;
  totalPages: number;
  filters: Record<string, FilterOption[]>;
  loading: boolean;
  setParams: (params: CatalogSearchParams) => void;
}

export function useComponentSearch(
  category: ComponentCategory | null,
  initialParams?: CatalogSearchParams,
): UseComponentSearchResult {
  const [result, setResult] = useState<CatalogSearchResult>({
    items: [], total: 0, page: 1, limit: 30, totalPages: 1, filters: {},
  });
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<CatalogSearchParams>(initialParams ?? { limit: 30 });
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!category) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const seq = ++seqRef.current;

    // Effect synchronizes with an external system (REST catalog search).
    // setLoading(true) is the canonical "request started" indicator for
    // that external call; not derivable from props.
     
    setLoading(true);
    searchCatalog(category, params)
      .then(data => {
        if (seq === seqRef.current && !ctrl.signal.aborted) {
          setResult(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (seq === seqRef.current && !ctrl.signal.aborted) {
          setLoading(false);
        }
      });

    return () => ctrl.abort();
  }, [category, params]);

  const updateParams = useCallback((next: CatalogSearchParams) => {
    setParams(next);
  }, []);

  return {
    items: result.items as ComponentOption[],
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    filters: result.filters,
    loading,
    setParams: updateParams,
  };
}

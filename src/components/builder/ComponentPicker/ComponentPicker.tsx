import { useState, useMemo, useCallback, useEffect } from 'react';
import { ArrowLeft, Search, SlidersHorizontal, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { ComponentCategory, ComponentOption } from '../../../types/builder';
import { CATEGORY_LABELS } from '../../../types/builder';
import { useTranslation } from '../../../lib/i18n';
import { useComponentSearch } from '../../../hooks/useComponentSearch';
import type { CatalogSearchParams } from '../../../api/catalog';
import { ComponentFilters, type FilterState, emptyFilters } from './ComponentFilters';
import { ProductTable, getColumnsForCategory } from './ProductTable';
import styles from './ComponentPicker.module.scss';

const PAGE_SIZE = 30;

type SortDir = 'asc' | 'desc';

interface ComponentPickerProps {
  category: ComponentCategory;
  onSelect: (component: ComponentOption, retailer?: string) => void;
  onClose: () => void;
  onViewDetail: (component: ComponentOption) => void;
}

export function ComponentPicker({ category, onSelect, onClose, onViewDetail }: ComponentPickerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('price');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  const columns = useMemo(() => getColumnsForCategory(category), [category]);

  // Build API params from local state
  const params = useMemo<CatalogSearchParams>(() => ({
    q: search || undefined,
    page,
    limit: PAGE_SIZE,
    sort: sortKey,
    sortDir,
    inStock: filters.inStock || undefined,
    checkboxes: filters.checkboxes,
    ranges: filters.ranges,
  }), [search, page, sortKey, sortDir, filters]);

  const { items, total, totalPages, filters: apiFilters, loading, setParams } = useComponentSearch(category);

  // Push params to the hook whenever they change
  useEffect(() => {
    setParams(params);
  }, [params, setParams]);

  const handleSort = useCallback((key: string) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }, [sortKey]);

  // Reset to page 1 when filters or search change. Could be folded into the
  // setSearch/setFilters callsites but those live in child components — the
  // effect keeps the policy colocated with pagination state here.
   
  useEffect(() => { setPage(1); }, [search, filters]);

  // Convert API filter options to the format ComponentFilters expects
  const filterOptions = apiFilters;

  const handleSelect = useCallback((comp: ComponentOption) => {
    onSelect(comp);
  }, [onSelect]);

  return (
    <div className={styles.pickerPage}>
      {/* Mobile filter overlay */}
      {mobileFiltersOpen && (
        <div className={styles.mobileOverlay} onClick={() => setMobileFiltersOpen(false)}>
          <div className={styles.mobileSidebar} onClick={e => e.stopPropagation()}>
            <div className={styles.mobileSidebarHeader}>
              <span>{t('builder.filters.title')}</span>
              <button type="button" className={styles.mobileClose} onClick={() => setMobileFiltersOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <ComponentFilters
              category={category}
              filterOptions={filterOptions}
              filters={filters}
              onChange={setFilters}
            />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className={styles.desktopSidebar}>
        <ComponentFilters
          category={category}
          filterOptions={filterOptions}
          filters={filters}
          onChange={setFilters}
        />
      </div>

      {/* Results area */}
      <div className={styles.results}>
        {/* Header */}
        <header className={styles.resultsHeader}>
          <button type="button" className={styles.backBtn} onClick={onClose}>
            <ArrowLeft size={18} />
          </button>
          <h2 className={styles.pickerTitle}>{CATEGORY_LABELS[category]}</h2>
          <span className={styles.resultCount}>
            {loading ? '...' : t('builder.productCount', { count: String(total) })}
          </span>
          <div className={styles.headerSpacer} />
          <button
            type="button"
            className={styles.mobileFilterBtn}
            onClick={() => setMobileFiltersOpen(true)}
          >
            <SlidersHorizontal size={16} />
            <span>{t('builder.filters.title')}</span>
          </button>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('builder.search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </header>

        {/* Table */}
        {loading && items.length === 0 ? (
          <div className={styles.loadingState}>
            <Loader2 size={24} className={styles.spinner} />
          </div>
        ) : (
          <ProductTable
            components={items}
            columns={columns}
            category={category}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onSelect={handleSelect}
            onViewDetail={onViewDetail}
          />
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              type="button"
              className={styles.pageBtn}
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span className={styles.pageInfo}>
              {t('builder.page', { page: String(page), total: String(totalPages) })}
            </span>
            <button
              type="button"
              className={styles.pageBtn}
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              <ChevronRight size={16} />
            </button>
            <span className={styles.pageTotal}>
              {t('builder.productCount', { count: String(total) })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

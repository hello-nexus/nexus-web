import { useCallback } from 'react';
import type { ComponentCategory } from '../../../types/builder';
import type { FilterOption as ApiFilterOption } from '../../../api/catalog';
import { useTranslation } from '../../../lib/i18n';
import { FilterSection } from './FilterSection';
import { CheckboxFilterGroup } from './CheckboxFilterGroup';
import { RangeFilter } from './RangeFilter';
import styles from './ComponentPicker.module.scss';

// ── Filter state: category-agnostic shape ───────────────────────────────────

export interface FilterState {
  checkboxes: Record<string, string[]>; // key -> selected values
  ranges: Record<string, { min: string; max: string }>; // key -> min/max
  inStock: boolean;
}

export function emptyFilters(): FilterState {
  return { checkboxes: {}, ranges: {}, inStock: false };
}

export function hasActiveFilters(f: FilterState): boolean {
  for (const vals of Object.values(f.checkboxes)) {
    if (vals.length > 0) return true;
  }
  for (const r of Object.values(f.ranges)) {
    if (r.min !== '' || r.max !== '') return true;
  }
  return f.inStock;
}

// ── Filter option type from API ────────────────────────────────────────────

interface FilterOption {
  value: string;
  count: number;
}

// ── Props ───────────────────────────────────────────────────────────────────

interface ComponentFiltersProps {
  category: ComponentCategory;
  filterOptions: Record<string, ApiFilterOption[]>;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function ComponentFilters({ category, filterOptions, filters, onChange }: ComponentFiltersProps) {
  const { t } = useTranslation();

  const setCheckbox = useCallback((key: string, selected: string[]) => {
    onChange({ ...filters, checkboxes: { ...filters.checkboxes, [key]: selected } });
  }, [filters, onChange]);

  const setRange = useCallback((key: string, min: string, max: string) => {
    onChange({ ...filters, ranges: { ...filters.ranges, [key]: { min, max } } });
  }, [filters, onChange]);

  const getRange = (key: string) => filters.ranges[key] ?? { min: '', max: '' };
  const getChecked = (key: string) => filters.checkboxes[key] ?? [];

  const opts = (key: string): FilterOption[] => filterOptions[key] ?? [];

  const clearAll = () => {
    onChange(emptyFilters());
  };

  const renderFilters = () => {
    switch (category) {
      case 'cpu': return renderCpuFilters();
      case 'gpu': return renderGpuFilters();
      case 'motherboard': return renderMotherboardFilters();
      case 'ram': return renderRamFilters();
      case 'storage': return renderStorageFilters();
      case 'psu': return renderPsuFilters();
      case 'case': return renderCaseFilters();
      case 'cooler': return renderCoolerFilters();
      default: return renderGenericFilters();
    }
  };

  // Helper: render a checkbox section with the title threaded into the
  // group so its search placeholder reads "Search {Title}…".
  const checkSection = (
    title: string,
    key: string,
    opts_: FilterOption[],
    options?: { defaultOpen?: boolean; showCount?: boolean },
  ) => (
    <FilterSection
      title={title}
      count={options?.showCount === false ? undefined : opts_.length}
      defaultOpen={options?.defaultOpen}
    >
      <CheckboxFilterGroup
        options={opts_}
        selected={getChecked(key)}
        onChange={s => setCheckbox(key, s)}
        title={title}
      />
    </FilterSection>
  );

  // ── CPU ─────────────────────────────────────────────────────────────────

  const renderCpuFilters = () => (
    <>
      {checkSection(t('builder.filters.brand'), 'brand', opts('brand'))}
      {checkSection(t('builder.filters.socket'), 'socket', opts('socket'))}
      <FilterSection title={t('builder.filters.coreCount')} defaultOpen={false}>
        <RangeFilter {...getRange('cores')} onChange={(min, max) => setRange('cores', min, max)} />
      </FilterSection>
      <FilterSection title={t('builder.filters.tdp')} defaultOpen={false}>
        <RangeFilter {...getRange('tdp')} onChange={(min, max) => setRange('tdp', min, max)} unit="W" />
      </FilterSection>
      {checkSection(t('builder.filters.series'), 'chip', opts('chip'), { defaultOpen: false })}
      {checkSection(t('builder.filters.igp'), 'integratedGraphics', opts('integratedGraphics'), { defaultOpen: false, showCount: false })}
      {renderPriceAndStock()}
    </>
  );

  // ── GPU ─────────────────────────────────────────────────────────────────

  const renderGpuFilters = () => (
    <>
      {checkSection(t('builder.filters.brand'), 'brand', opts('brand'))}
      {checkSection(t('builder.filters.chipset'), 'chip', opts('chip'))}
      {checkSection(t('builder.col.vram'), 'vramGb', opts('vramGb'), { defaultOpen: false })}
      <FilterSection title={t('builder.filters.tdp')} defaultOpen={false}>
        <RangeFilter {...getRange('tdp')} onChange={(min, max) => setRange('tdp', min, max)} unit="W" />
      </FilterSection>
      <FilterSection title={t('builder.col.length')} defaultOpen={false}>
        {/* eslint-disable-next-line i18next/no-literal-string -- measurement unit symbol */}
        <RangeFilter {...getRange('lengthMm')} onChange={(min, max) => setRange('lengthMm', min, max)} unit="mm" />
      </FilterSection>
      {renderPriceAndStock()}
    </>
  );

  // ── Motherboard ─────────────────────────────────────────────────────────

  const renderMotherboardFilters = () => (
    <>
      {checkSection(t('builder.filters.brand'), 'brand', opts('brand'))}
      {checkSection(t('builder.filters.socket'), 'socket', opts('socket'))}
      {checkSection(t('builder.col.formFactor'), 'formFactor', opts('formFactor'))}
      {checkSection(t('builder.filters.chipset'), 'chip', opts('chip'), { defaultOpen: false })}
      {checkSection(t('builder.filters.memoryType'), 'ddrType', opts('ddrType'), { defaultOpen: false })}
      <FilterSection title={t('builder.col.memorySlots')} defaultOpen={false}>
        <RangeFilter {...getRange('memorySlots')} onChange={(min, max) => setRange('memorySlots', min, max)} />
      </FilterSection>
      <FilterSection title={t('builder.filters.m2Slots')} defaultOpen={false}>
        <RangeFilter {...getRange('m2Slots')} onChange={(min, max) => setRange('m2Slots', min, max)} />
      </FilterSection>
      {renderPriceAndStock()}
    </>
  );

  // ── RAM ─────────────────────────────────────────────────────────────────

  const renderRamFilters = () => (
    <>
      {checkSection(t('builder.filters.brand'), 'brand', opts('brand'))}
      {checkSection(t('builder.col.type'), 'ddrType', opts('ddrType'))}
      {checkSection(t('builder.col.capacity'), 'capacityGb', opts('capacityGb'))}
      <FilterSection title={t('builder.col.speed')} defaultOpen={false}>
        {/* eslint-disable-next-line i18next/no-literal-string -- measurement unit symbol */}
        <RangeFilter {...getRange('speed')} onChange={(min, max) => setRange('speed', min, max)} unit="MHz" />
      </FilterSection>
      <FilterSection title={t('builder.col.cas')} defaultOpen={false}>
        <RangeFilter {...getRange('latency')} onChange={(min, max) => setRange('latency', min, max)} />
      </FilterSection>
      {checkSection(t('builder.col.modules'), 'modules', opts('modules'), { defaultOpen: false })}
      {renderPriceAndStock()}
    </>
  );

  // ── Storage ─────────────────────────────────────────────────────────────

  const renderStorageFilters = () => (
    <>
      {checkSection(t('builder.filters.brand'), 'brand', opts('brand'))}
      {checkSection(t('builder.col.interface'), 'interface', opts('interface'))}
      <FilterSection title={t('builder.col.capacity')} defaultOpen={false}>
        <RangeFilter {...getRange('capacityGb')} onChange={(min, max) => setRange('capacityGb', min, max)} unit="GB" />
      </FilterSection>
      {checkSection(t('builder.col.formFactor'), 'formFactor', opts('formFactor'), { defaultOpen: false })}
      {renderPriceAndStock()}
    </>
  );

  // ── PSU ─────────────────────────────────────────────────────────────────

  const renderPsuFilters = () => (
    <>
      {checkSection(t('builder.filters.brand'), 'brand', opts('brand'))}
      <FilterSection title={t('builder.col.wattage')}>
        <RangeFilter {...getRange('wattage')} onChange={(min, max) => setRange('wattage', min, max)} unit="W" />
      </FilterSection>
      {checkSection(t('builder.col.efficiency'), 'efficiency', opts('efficiency'))}
      {checkSection(t('builder.col.modular'), 'modular', opts('modular'), { defaultOpen: false })}
      {opts('formFactor').length > 0 && checkSection(t('builder.col.formFactor'), 'formFactor', opts('formFactor'), { defaultOpen: false })}
      {renderPriceAndStock()}
    </>
  );

  // ── Case ────────────────────────────────────────────────────────────────

  const renderCaseFilters = () => (
    <>
      {checkSection(t('builder.filters.brand'), 'brand', opts('brand'))}
      {checkSection(t('builder.col.formFactor'), 'formFactors', opts('formFactors'))}
      <FilterSection title={t('builder.col.maxGpuLength')} defaultOpen={false}>
        {/* eslint-disable-next-line i18next/no-literal-string -- measurement unit symbol */}
        <RangeFilter {...getRange('maxGpuLengthMm')} onChange={(min, max) => setRange('maxGpuLengthMm', min, max)} unit="mm" />
      </FilterSection>
      <FilterSection title={t('builder.col.maxCoolerHeight')} defaultOpen={false}>
        {/* eslint-disable-next-line i18next/no-literal-string -- measurement unit symbol */}
        <RangeFilter {...getRange('maxCoolerHeightMm')} onChange={(min, max) => setRange('maxCoolerHeightMm', min, max)} unit="mm" />
      </FilterSection>
      <FilterSection title={t('builder.filters.driveBays35')} defaultOpen={false}>
        <RangeFilter {...getRange('driveBays35')} onChange={(min, max) => setRange('driveBays35', min, max)} />
      </FilterSection>
      <FilterSection title={t('builder.filters.driveBays25')} defaultOpen={false}>
        <RangeFilter {...getRange('driveBays25')} onChange={(min, max) => setRange('driveBays25', min, max)} />
      </FilterSection>
      {renderPriceAndStock()}
    </>
  );

  // ── Cooler ──────────────────────────────────────────────────────────────

  const renderCoolerFilters = () => (
    <>
      {checkSection(t('builder.filters.brand'), 'brand', opts('brand'))}
      {checkSection(t('builder.col.type'), 'type', opts('type'))}
      {checkSection(t('builder.col.radiatorSize'), 'radiatorMm', opts('radiatorMm'), { defaultOpen: false })}
      {checkSection(t('builder.col.socketSupport'), 'sockets', opts('sockets'), { defaultOpen: false })}
      {renderPriceAndStock()}
    </>
  );

  // ── Generic ─────────────────────────────────────────────────────────────

  const renderGenericFilters = () => (
    <>
      {opts('brand').length > 0 && checkSection(t('builder.filters.brand'), 'brand', opts('brand'))}
      {opts('chip').length > 0 && checkSection(t('builder.filters.chipset'), 'chip', opts('chip'))}
      {renderPriceAndStock()}
    </>
  );

  // ── Price + Stock (shared) ──────────────────────────────────────────────

  const renderPriceAndStock = () => (
    <>
      <FilterSection title={t('builder.filters.price')}>
        <RangeFilter {...getRange('price')} onChange={(min, max) => setRange('price', min, max)} unit="$" />
      </FilterSection>
      <FilterSection title={t('builder.filters.instock')} defaultOpen={false}>
        <label className={styles.stockToggle}>
          <input
            type="checkbox"
            checked={filters.inStock}
            onChange={e => onChange({ ...filters, inStock: e.target.checked })}
          />
          <span>{t('builder.filters.instock')}</span>
        </label>
      </FilterSection>
    </>
  );

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>{t('builder.filters.title')}</span>
        {hasActiveFilters(filters) && (
          <button type="button" className={styles.clearBtn} onClick={clearAll}>
            {t('builder.filters.clear')}
          </button>
        )}
      </div>
      <div className={styles.sidebarContent}>
        {renderFilters()}
      </div>
    </div>
  );
}

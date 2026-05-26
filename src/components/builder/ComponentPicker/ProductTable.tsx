// getColumnsForCategory ships next to ProductTable because it returns the
// column shape ProductTable consumes; both are imported together by
// ComponentPicker and would just be re-imported from a sibling otherwise.
 
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { ComponentCategory, ComponentOption } from '../../../types/builder';
import { useTranslation } from '../../../lib/i18n';
import styles from './ComponentPicker.module.scss';

export interface ColumnDef {
  key: string;
  labelKey: string;
  sortable?: boolean;
  getValue: (c: ComponentOption) => string | number | null;
  format?: (v: string | number | null) => string;
}

interface ProductTableProps {
  components: ComponentOption[];
  columns: ColumnDef[];
  category: ComponentCategory;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  onSelect: (component: ComponentOption) => void;
  onViewDetail: (component: ComponentOption) => void;
}

function defaultFormat(v: string | number | null): string {
  if (v == null || v === '') return '\u2014';
  return String(v);
}

export function ProductTable({
  components,
  columns,
  sortKey,
  sortDir,
  onSort,
  onSelect,
  onViewDetail,
}: ProductTableProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.tableWrap}>
      <table className={styles.productTable}>
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={`${styles.productTh} ${col.sortable !== false ? styles.sortable : ''} ${sortKey === col.key ? styles.sortActive : ''}`}
                onClick={() => col.sortable !== false && onSort(col.key)}
              >
                <span>{t(col.labelKey)}</span>
                {sortKey === col.key && (
                  sortDir === 'asc'
                    ? <ArrowUp size={12} className={styles.sortArrow} />
                    : <ArrowDown size={12} className={styles.sortArrow} />
                )}
              </th>
            ))}
            <th className={styles.productTh}></th>
          </tr>
        </thead>
        <tbody>
          {components.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className={styles.noResults}>
                {t('builder.no_results')}
              </td>
            </tr>
          ) : (
            components.map(comp => (
              <tr
                key={comp.id}
                className={styles.productRow}
              >
                {columns.map(col => {
                  const val = col.getValue(comp);
                  const formatted = col.format ? col.format(val) : defaultFormat(val);
                  const isName = col.key === 'name';
                  return (
                    <td key={col.key} className={styles.productTd}>
                      {isName ? (
                        <button
                          type="button"
                          className={styles.nameLink}
                          onClick={() => onViewDetail(comp)}
                        >
                          {formatted}
                        </button>
                      ) : formatted}
                    </td>
                  );
                })}
                <td className={styles.productTd}>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => onSelect(comp)}
                  >
                    {t('builder.add_to_build')}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Category-specific column definitions ────────────────────────────────────

function priceFormat(v: string | number | null): string {
  if (v == null) return '\u2014';
  return `$${Number(v).toFixed(2)}`;
}

function unitFormat(unit: string) {
  return (v: string | number | null): string => {
    if (v == null || v === '') return '\u2014';
    return `${v} ${unit}`;
  };
}

export function getColumnsForCategory(category: ComponentCategory): ColumnDef[] {
  switch (category) {
    case 'cpu':
      return [
        { key: 'name', labelKey: 'builder.col.name', getValue: c => c.title },
        { key: 'cores', labelKey: 'builder.col.cores', getValue: c => c.specs.cores ?? null },
        { key: 'baseClock', labelKey: 'builder.col.baseClock', getValue: c => c.specs.baseClock ?? null, format: unitFormat('GHz') },
        { key: 'boostClock', labelKey: 'builder.col.boostClock', getValue: c => c.specs.boostClock ?? null, format: unitFormat('GHz') },
        { key: 'tdp', labelKey: 'builder.col.tdp', getValue: c => c.specs.tdp ?? null, format: unitFormat('W') },
        { key: 'socket', labelKey: 'builder.col.socket', getValue: c => c.specs.socket ?? null },
        { key: 'price', labelKey: 'builder.filters.price', getValue: c => c.bestPrice, format: priceFormat },
      ];
    case 'gpu':
      return [
        { key: 'name', labelKey: 'builder.col.name', getValue: c => c.title },
        { key: 'chip', labelKey: 'builder.col.chipset', getValue: c => c.chip ?? null },
        { key: 'vramGb', labelKey: 'builder.col.vram', getValue: c => c.specs.vramGb ?? null, format: unitFormat('GB') },
        { key: 'tdp', labelKey: 'builder.col.tdp', getValue: c => c.specs.tdp ?? null, format: unitFormat('W') },
        { key: 'lengthMm', labelKey: 'builder.col.length', getValue: c => c.specs.lengthMm ?? null, format: unitFormat('mm') },
        { key: 'price', labelKey: 'builder.filters.price', getValue: c => c.bestPrice, format: priceFormat },
      ];
    case 'motherboard':
      return [
        { key: 'name', labelKey: 'builder.col.name', getValue: c => c.title },
        { key: 'socket', labelKey: 'builder.col.socket', getValue: c => c.specs.socket ?? null },
        { key: 'formFactor', labelKey: 'builder.col.formFactor', getValue: c => c.specs.formFactor ?? null },
        { key: 'chip', labelKey: 'builder.col.chipset', getValue: c => c.chip ?? null },
        { key: 'memorySlots', labelKey: 'builder.col.memorySlots', getValue: c => c.specs.memorySlots ?? null },
        { key: 'price', labelKey: 'builder.filters.price', getValue: c => c.bestPrice, format: priceFormat },
      ];
    case 'ram':
      return [
        { key: 'name', labelKey: 'builder.col.name', getValue: c => c.title },
        { key: 'ddrType', labelKey: 'builder.col.type', getValue: c => c.specs.ddrType ?? null },
        { key: 'capacityGb', labelKey: 'builder.col.capacity', getValue: c => c.specs.capacityGb ?? null, format: unitFormat('GB') },
        { key: 'speed', labelKey: 'builder.col.speed', getValue: c => c.specs.speed ?? null, format: unitFormat('MHz') },
        { key: 'latency', labelKey: 'builder.col.cas', getValue: c => c.specs.latency ?? null },
        { key: 'modules', labelKey: 'builder.col.modules', getValue: c => c.specs.modules ?? null },
        { key: 'price', labelKey: 'builder.filters.price', getValue: c => c.bestPrice, format: priceFormat },
      ];
    case 'storage':
      return [
        { key: 'name', labelKey: 'builder.col.name', getValue: c => c.title },
        { key: 'interface', labelKey: 'builder.col.interface', getValue: c => c.specs.interface ?? null },
        { key: 'capacityGb', labelKey: 'builder.col.capacity', getValue: c => c.specs.capacityGb ?? null, format: unitFormat('GB') },
        { key: 'formFactor', labelKey: 'builder.col.formFactor', getValue: c => c.specs.formFactor ?? null },
        { key: 'price', labelKey: 'builder.filters.price', getValue: c => c.bestPrice, format: priceFormat },
      ];
    case 'psu':
      return [
        { key: 'name', labelKey: 'builder.col.name', getValue: c => c.title },
        { key: 'wattage', labelKey: 'builder.col.wattage', getValue: c => c.specs.wattage ?? null, format: unitFormat('W') },
        { key: 'efficiency', labelKey: 'builder.col.efficiency', getValue: c => c.specs.efficiency ?? null },
        { key: 'modular', labelKey: 'builder.col.modular', getValue: c => c.specs.modular ?? null },
        { key: 'price', labelKey: 'builder.filters.price', getValue: c => c.bestPrice, format: priceFormat },
      ];
    case 'case':
      return [
        { key: 'name', labelKey: 'builder.col.name', getValue: c => c.title },
        { key: 'formFactors', labelKey: 'builder.col.formFactor', sortable: false, getValue: c => {
          const ff = c.specs.formFactors;
          if (Array.isArray(ff)) return ff.join(', ');
          return ff ?? null;
        }},
        { key: 'maxGpuLengthMm', labelKey: 'builder.col.maxGpuLength', getValue: c => c.specs.maxGpuLengthMm ?? null, format: unitFormat('mm') },
        { key: 'maxCoolerHeightMm', labelKey: 'builder.col.maxCoolerHeight', getValue: c => c.specs.maxCoolerHeightMm ?? null, format: unitFormat('mm') },
        { key: 'price', labelKey: 'builder.filters.price', getValue: c => c.bestPrice, format: priceFormat },
      ];
    case 'cooler':
      return [
        { key: 'name', labelKey: 'builder.col.name', getValue: c => c.title },
        { key: 'type', labelKey: 'builder.col.type', getValue: c => c.specs.type ?? null },
        { key: 'radiatorMm', labelKey: 'builder.col.radiatorSize', getValue: c => c.specs.radiatorMm ?? null, format: unitFormat('mm') },
        { key: 'sockets', labelKey: 'builder.col.socketSupport', sortable: false, getValue: c => {
          const s = c.specs.sockets;
          if (Array.isArray(s)) return s.join(', ');
          return s ?? null;
        }},
        { key: 'price', labelKey: 'builder.filters.price', getValue: c => c.bestPrice, format: priceFormat },
      ];
    default:
      return [
        { key: 'name', labelKey: 'builder.col.name', getValue: c => c.title },
        { key: 'price', labelKey: 'builder.filters.price', getValue: c => c.bestPrice, format: priceFormat },
      ];
  }
}

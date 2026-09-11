import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, GripVertical, Plus, X } from 'lucide-react';
import { fetchMappingCatalog, type BuiltInMappingSummary, type ChainEntryBody } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { isMultiSelectModifier } from '../../../../lib/platform';
import { SearchInput } from '../../../../components/common/SearchInput/SearchInput';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { SortableList, type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import { formatZoneChipCount } from './zoneUtils';
import { loadRecentProducts, pushRecentProduct } from './recentProducts';
import styles from './ZoneChainList.module.scss';

/** Debounce on the catalog query, ms. Local lookup, so this can be short. */
const SEARCH_DEBOUNCE_MS = 120;
const RESULT_LIMIT = 50;
const MAX_LED_COUNT = 1024;

export interface ChainRow {
  zoneId: string;
  name: string;
  ledCount: number;
  /** LEDs not parked, for the enabled/total readout. */
  enabledCount: number;
  /** The product wired at this position; marks the picker's current choice. */
  key?: string;
  /** A generic fan or strip: the count is typed on the row. A product's count is locked to its artifact. */
  editableCount: boolean;
}

/**
 * The editor's Devices section: a vertical list, one row per zone in wire
 * order. A row's name selects that zone for editing on the canvas
 * (modifier-click marks it for a merge), and on a chainable port the row is
 * also what is wired there - a catalog product, whose count is typed on the
 * row when the product is a generic. A device with fixed zones (a keeb) gets
 * the same rows read-only. On a chainable port with more than one row, each
 * row can be dragged (or reordered via arrow keys while lifted with Space)
 * to change its position in the chain.
 */
export function ZoneChainList({ rows, chainable, selectedZoneId, markedIds, disabled, onSelect, onChange, onAdd, onRemove, onReorder, actions }: {
  rows: ChainRow[];
  /** A single addressable port: rows can be picked, retyped, added, removed and reordered. */
  chainable: boolean;
  selectedZoneId: string;
  /** Zones marked for a merge. */
  markedIds: Set<string>;
  disabled?: boolean;
  onSelect: (zoneId: string, multi: boolean) => void;
  /** Row `index` becomes this product, at this count when it is a generic. */
  onChange: (index: number, entry: ChainEntryBody) => void;
  onAdd: (entry: ChainEntryBody) => void;
  onRemove: (index: number) => void;
  /** New wire order, as zone ids, from a drag or keyboard reorder; posts the same entries in that order. */
  onReorder: (zoneIds: string[]) => void;
  /** Zone tools, rendered in the footer beside the add button. */
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  // Which row's product picker is open; 'add' is the one behind the + button.
  const [picker, setPicker] = useState<number | 'add' | null>(null);
  // A generic being added lives only here until its count is typed, so no
  // chain is posted for a zone the user has not sized yet.
  const [pending, setPending] = useState<{ key: string; name: string } | null>(null);
  useEffect(() => { setPending(null); }, [rows.length]);
  const total = rows.reduce((n, r) => n + r.ledCount, 0);
  const canReorder = chainable && rows.length > 1;

  const renderRow = (row: ChainRow, i: number, drag?: SortableRowArgs) => {
    const editable = chainable && row.editableCount;
    return (
      <div
        ref={drag?.ref}
        style={drag?.style}
        role="listitem"
        {...(drag?.attributes ?? {})}
        className={[
          styles.row,
          markedIds.has(row.zoneId) ? styles.rowMarked : '',
          row.zoneId === selectedZoneId ? styles.rowActive : '',
          drag?.isDragging ? drag.placeholderClassName : '',
        ].filter(Boolean).join(' ')}
      >
        {canReorder && (
          <button
            type="button"
            className={styles.dragHandle}
            data-drag-handle="true"
            disabled={disabled}
            aria-label={t('lighting.ledMap.chainReorder', { name: row.name })}
            {...(drag?.listeners ?? {})}
          >
            <GripVertical size={14} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className={styles.rowName}
          disabled={disabled}
          onClick={e => onSelect(row.zoneId, isMultiSelectModifier(e))}
        >
          {row.name}
        </button>
        {chainable && (
          <button
            type="button"
            className={styles.pick}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={picker === i}
            aria-label={t('lighting.ledMap.assignDevice')}
            onClick={() => setPicker(picker === i ? null : i)}
          >
            <ChevronDown size={13} aria-hidden />
          </button>
        )}
        {editable ? (
          <CountInput value={row.ledCount} disabled={disabled} onCommit={n => onChange(i, { key: row.key!, ledCount: n })} />
        ) : (
          <span className={styles.zoneCount}>{formatZoneChipCount(row.enabledCount, row.ledCount)}</span>
        )}
        {chainable && rows.length > 1 && (
          <HoverTooltip body={t('lighting.ledMap.chainRemove')} side="top">
            <button
              type="button"
              className={styles.remove}
              disabled={disabled}
              aria-label={t('lighting.ledMap.chainRemove')}
              onClick={() => onRemove(i)}
            >
              <X size={12} aria-hidden />
            </button>
          </HoverTooltip>
        )}
        {picker === i && (
          <ProductPicker
            current={row.key}
            onClose={() => setPicker(null)}
            // A generic keeps the row's count; the field only unlocks.
            onPick={item => {
              setPicker(null);
              pushRecentProduct(item);
              onChange(i, item.parametric ? { key: item.key, ledCount: row.ledCount } : { key: item.key });
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className={styles.section}>
      <div className={styles.header}>{t('lighting.rightPane.devices')}</div>
      {canReorder ? (
        <SortableList
          className={styles.list}
          ariaLabel={t('lighting.rightPane.devices')}
          ids={rows.map(r => r.zoneId)}
          onReorder={onReorder}
          renderRow={(id, a) => {
            const i = rows.findIndex(r => r.zoneId === id);
            return i === -1 ? null : renderRow(rows[i], i, a);
          }}
        />
      ) : (
        <div className={styles.list} role="list">
          {rows.map((row, i) => <Fragment key={row.zoneId}>{renderRow(row, i)}</Fragment>)}
        </div>
      )}
      {pending && (
        // Not part of role="list" above - it stages a not-yet-added zone
        // outside the persisted rows, so it carries no listitem role either.
        <div className={`${styles.row} ${styles.rowPending}`}>
          <span className={styles.rowName}>{pending.name}</span>
          <CountInput
            value={null}
            autoFocus
            disabled={disabled}
            onCommit={n => onAdd({ key: pending.key, ledCount: n })}
            onCancel={() => setPending(null)}
          />
          <button
            type="button"
            className={styles.remove}
            aria-label={t('lighting.ledMap.chainRemove')}
            onClick={() => setPending(null)}
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      )}
      <div className={styles.footer}>
        {chainable && (
          <div className={styles.addWrap}>
            <HoverTooltip body={t('lighting.ledMap.chainAdd')} side="top">
              <button
                type="button"
                className={styles.add}
                disabled={disabled || pending !== null}
                aria-haspopup="listbox"
                aria-expanded={picker === 'add'}
                aria-label={t('lighting.ledMap.chainAdd')}
                onClick={() => setPicker(picker === 'add' ? null : 'add')}
              >
                <Plus size={13} aria-hidden />
              </button>
            </HoverTooltip>
            {picker === 'add' && (
              <ProductPicker
                onClose={() => setPicker(null)}
                onPick={item => {
                  setPicker(null);
                  pushRecentProduct(item);
                  if (item.parametric) setPending({ key: item.key, name: item.name });
                  else onAdd({ key: item.key });
                }}
              />
            )}
          </div>
        )}
        {actions}
        <span className={styles.spacer} />
        <span className={styles.total}>
          {t('lighting.ledMap.chainTotal')}
          <span className={styles.totalCount}>{total}</span>
        </span>
      </div>
    </div>
  );
}

/** A generic's LED count. Commits on blur or Enter, reverts on Escape; a null value is a blank field for a row not sized yet. */
function CountInput({ value, autoFocus, disabled, onCommit, onCancel }: {
  value: number | null;
  autoFocus?: boolean;
  disabled?: boolean;
  onCommit: (count: number) => void;
  /** Blank or escaped with no value to fall back on. */
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const escapeRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(value === null ? '' : String(value)); }, [value]);
  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);
  const revert = () => {
    setDraft(value === null ? '' : String(value));
    if (value === null) onCancel?.();
  };
  return (
    <input
      ref={inputRef}
      type="number"
      className={styles.zoneCountInput}
      value={draft}
      min={1}
      max={MAX_LED_COUNT}
      disabled={disabled}
      aria-label={t('lighting.ledMap.ledCount')}
      onChange={e => setDraft(e.target.value)}
      onBlur={e => {
        if (escapeRef.current) { escapeRef.current = false; return; }
        const n = parseInt(e.currentTarget.value, 10);
        if (isNaN(n)) { revert(); return; }
        const clamped = Math.max(1, Math.min(MAX_LED_COUNT, n));
        if (clamped === value) { setDraft(String(clamped)); return; }
        onCommit(clamped);
      }}
      onKeyDown={e => {
        // The editor's shortcuts (undo, delete, arrows) must not fire from here.
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          escapeRef.current = true;
          revert();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/**
 * Catalog search for one row. An ARGB port reports a LED count and never what
 * is plugged in, so the user has to say; the generic fan and strip cover
 * hardware the catalog does not name. Served from the service binary, so it
 * works with no network and no account. With the box empty the last few picks
 * lead the list; typing replaces them with the search.
 */
function ProductPicker({ current, onPick, onClose }: {
  /** The row's product key; absent for the add picker. */
  current?: string;
  onPick: (item: BuiltInMappingSummary) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<BuiltInMappingSummary[]>([]);
  const [recents, setRecents] = useState<BuiltInMappingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Recent picks re-resolve through the catalog by name, so one it no longer
  // lists is dropped rather than offered dead, and the rows carry its current
  // name and count. The generics are always in it.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(loadRecentProducts().map(r => r.parametric
      ? Promise.resolve<BuiltInMappingSummary | null>(r)
      : fetchMappingCatalog(r.name, undefined, RESULT_LIMIT).then(resp => resp?.items.find(i => i.key === r.key) ?? null),
    )).then(found => {
      if (!cancelled) setRecents(found.filter((r): r is BuiltInMappingSummary => r !== null));
    });
    return () => { cancelled = true; };
  }, []);

  // Debounced catalog lookup. An empty query is a valid search - it returns the
  // head of the catalog, so the list is never blank on first open.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void fetchMappingCatalog(query, undefined, RESULT_LIMIT).then(resp => {
        if (cancelled) return;
        setItems(resp?.items ?? []);
        setLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  // Close on an outside click or Escape. Escape is captured so the editor
  // modal does not also close on the same key.
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  const row = (item: BuiltInMappingSummary, keyPrefix: string) => (
    <button
      type="button"
      key={keyPrefix + item.key}
      role="option"
      aria-selected={current === item.key}
      className={`${styles.result} ${current === item.key ? styles.active : ''}`}
      onClick={() => onPick(item)}
    >
      <span className={styles.resultName}>{item.name}</span>
      {/* A generic has no count of its own; the row's field supplies it. */}
      {!item.parametric && (
        <span className={styles.resultMeta}>
          {t('lighting.ledMap.assignLeds', { count: item.ledCount })}
        </span>
      )}
    </button>
  );

  return (
    <div className={styles.popover} ref={rootRef}>
      <SearchInput
        value={query}
        onChange={setQuery}
        autoFocus
        placeholder={t('lighting.ledMap.assignSearch')}
        ariaLabel={t('lighting.ledMap.assignSearch')}
      />
      <div className={styles.results} role="listbox">
        {query === '' && recents.length > 0 && (
          <>
            <div className={styles.resultsHeading}>{t('search.section.recent')}</div>
            {recents.map(item => row(item, 'recent:'))}
            <div className={styles.resultsDivider} />
          </>
        )}
        {items.map(item => row(item, ''))}
        {!loading && items.length === 0 && (
          <div className={styles.empty}>{t('lighting.ledMap.assignNoResults')}</div>
        )}
      </div>
    </div>
  );
}

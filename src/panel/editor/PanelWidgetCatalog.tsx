import { useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { SearchInput } from '../../components/common/SearchInput/SearchInput';
import { useTranslation } from '../../lib/i18n';
import type { PanelLayout, PanelSurface, PanelWidget, PanelWidgetSize } from '../types';
import { PANEL_GRID_GAP, sizeToSpan } from '../engine/grid';
import { PHONE_WIDGET_REFERENCE_CELL } from '../panelGrid';
import { appendWidget } from '../engine/panelLayoutOps';
import { getCatalogEntries, pickerSizeFor, sizesForSurface, appAvailableForSurface } from '../widgets/registry';
import {
  isMarketplaceIdEnabled,
  isMarketplaceRegistryStale,
  isMarketplaceType,
  loadMarketplaceWidgets,
  marketplaceIdFromType,
  subscribeMarketplaceRegistry,
} from '../../widgets/marketplaceRegistry';
import { PanelCatalogCell } from '../PanelDragCells';
import panelStyles from '../PanelApp.module.scss';
import styles from './PanelWidgetCatalog.module.scss';

// The catalog IS a panel grid. The column count is a multiple of 4 sized so
// each cell lands near this target, then widgets pack row-major via the panel's
// appendWidget and render through the panel's own cell (PanelCatalogCell) — same
// scaling, label sizing, and fill as the live panel. Tune for tile size: a
// narrow add-widget sheet lands on 4 columns (like the phone panel); wider
// device-page panes step up to 8 / 12.
const CATALOG_TARGET_CELL = 100;

type CatalogEntry = ReturnType<typeof getCatalogEntries>[number];

export interface PanelWidgetCatalogProps {
  surface: PanelSurface;
  onAdd: (type: string, size: PanelWidgetSize) => void;
  searchable?: boolean;
  variant?: 'panel-sheet' | 'desktop-modal';
  // The target panel connects over the network (paired phone/browser/app), so
  // local-only widgets (the pairing QR) are hidden.
  remote?: boolean;
  themeMode?: 'dark' | 'light';
  // Inline panel-theme CSS vars (--panel-accent + the --accent family from
  // buildPanelThemeVars). Inside desktop chrome (e.g. the device-management
  // modal) the surrounding stylesheet sets --accent to the desktop's accent;
  // without this prop the search input + previews highlight in the wrong hue.
  themeStyle?: CSSProperties;
  className?: string;
  // Highlight the card matching this widget type. Used by single-widget
  // surfaces (q-series) to mark the device's active widget.
  selectedWidgetType?: string;
}

export function PanelWidgetCatalog({
  surface,
  onAdd,
  searchable = true,
  variant = 'panel-sheet',
  remote = false,
  themeMode,
  themeStyle,
  className,
  selectedWidgetType,
}: PanelWidgetCatalogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  // Force re-render on marketplace registry refresh — the catalog reads a
  // module-level cache React can't observe without an explicit subscription.
  const forceRender = useReducer((r: number) => r + 1, 0)[1];
  const normalised = query.trim().toLowerCase();

  useEffect(() => {
    if (isMarketplaceRegistryStale()) {
      void loadMarketplaceWidgets();
    }
    return subscribeMarketplaceRegistry(forceRender);
  }, [forceRender]);

  // Show built-ins + allowlisted marketplace widgets only. The registry may
  // carry more bundled widgets than the allowlist (already-placed instances
  // still render via lookupApp); the Add-a-Widget picker stays curated.
  const entries = getCatalogEntries().filter(([type, def]) => {
    if (!appAvailableForSurface(def.meta, surface, { remote })) return false;
    if (isMarketplaceType(type)) {
      const id = marketplaceIdFromType(type);
      return id !== null && isMarketplaceIdEnabled(id);
    }
    return true;
  });
  // Split built-ins from marketplace for the "MARKETPLACE (BETA)" separator.
  const builtIns = entries.filter(([type]) => !isMarketplaceType(type));
  const marketplace = entries.filter(([type]) => isMarketplaceType(type));
  const matchesSearch = (type: string, def: { meta: { i18nKey: string } }) => {
    if (!normalised) return true;
    const label = (t(def.meta.i18nKey) || type).toLowerCase();
    return label.includes(normalised) || type.toLowerCase().includes(normalised);
  };
  const visibleBuiltIns = builtIns.filter(([type, def]) => matchesSearch(type, def));
  const visibleMarketplace = marketplace.filter(([type, def]) => matchesSearch(type, def));
  const visibleCount = visibleBuiltIns.length + visibleMarketplace.length;

  const rootClass = [
    'panel-root',
    styles.root,
    variant === 'desktop-modal' ? styles.desktop : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  // Measure the available width, then pick a multiple-of-4 column count sized so
  // each cell sits near the target. Cell size drives the panel grid vars below.
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  // Layout effect so the first paint already has the measured column count —
  // avoids a one-frame flash from the fallback 4 columns to the real count.
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const update = () => setGridWidth(el.clientWidth);
    update();
    // jsdom (vitest) has no ResizeObserver; fall back to the one-shot measure.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const gap = PANEL_GRID_GAP;
  const cols = gridWidth > 0
    ? Math.max(4, Math.ceil(gridWidth / (CATALOG_TARGET_CELL + gap) / 4) * 4)
    : 4;
  const cellSize = gridWidth > 0 ? (gridWidth - (cols - 1) * gap) / cols : CATALOG_TARGET_CELL;

  // Panel grid CSS vars on the catalog root so the reused .grid + PanelCatalogCell
  // inherit the live panel's column count, cell size, content scale, label-strip
  // sizing, and gap — one rendering path, identical to the panel. Always set
  // (cols/cellSize fall back to 4 / target before the first measure) so
  // `--panel-columns` is never undefined, which would collapse the grid.
  const panelGridVars: CSSProperties = {
    '--panel-columns': cols,
    '--panel-cell-size': `${cellSize}px`,
    '--panel-row-size': `${cellSize}px`,
    '--panel-content-scale': `${cellSize}px`,
    // Plain-number scale (cell / 90px design base). The default token derives
    // this via CSS trig (`tan(atan2(...))`), which `scale()` reads but the cell
    // scaler's `width: calc(inner / scale)` division does NOT evaluate —
    // leaving widget content scaled down without compensation. A number fills.
    '--panel-scale': cellSize / PHONE_WIDGET_REFERENCE_CELL,
    '--panel-gap': `${gap}px`,
  } as CSSProperties;

  // Pack an ordered entry list into `cols` columns the way the panel does:
  // row-major first-free-rect on a single page (no implicit new pages). 1x1
  // widgets are held back and laid out left-to-right on fresh rows BELOW
  // everything else, so the smallest tiles always group at the bottom of the
  // grid instead of back-filling gaps higher up.
  // Picker size for a widget, adjusted for the browse grid's width. At exactly
  // 4 columns a 4x2 spans the full row (one widget per row); prefer the
  // half-width 2x2 where the widget supports it so the narrow grid stays
  // compact. Wider grids (8 / 12 / ...) keep the panel's 4x2 preference.
  const pickSize = (meta: CatalogEntry[1]['meta']): PanelWidgetSize => {
    const size = pickerSizeFor(meta, surface);
    if (cols === 4 && size === '4x2' && sizesForSurface(meta, surface).includes('2x2')) {
      return '2x2';
    }
    return size;
  };

  const packEntries = (items: CatalogEntry[]): PanelWidget[] => {
    const sized = items.map(([type, def]) => ({ type, size: pickSize(def.meta) }));
    let acc: PanelLayout = {
      layoutSchemaVersion: 1,
      surface,
      pages: [{ id: 'catalog', widgets: [] }],
    };
    for (const { type, size } of sized.filter(w => w.size !== '1x1')) {
      acc = appendWidget(acc, { id: type, type, size, col: 0, row: 0 }, { gridCols: cols, pageRows: 10_000 }, { singlePage: true });
    }
    const placed = acc.pages[0]?.widgets ?? [];
    const baseRow = placed.reduce((max, w) => Math.max(max, w.row + sizeToSpan(w.size).rows), 0);
    const ones = sized
      .filter(w => w.size === '1x1')
      .map((w, i): PanelWidget => ({
        id: w.type, type: w.type, size: w.size,
        col: i % cols, row: baseRow + Math.floor(i / cols),
      }));
    return [...placed, ...ones];
  };

  const defByType = new Map(entries);
  const renderPacked = (items: CatalogEntry[]) =>
    packEntries(items).map(w => {
      const def = defByType.get(w.type);
      return (
        <PanelCatalogCell
          key={w.id}
          widget={w}
          surface={surface}
          label={def ? t(def.meta.i18nKey) || w.type : w.type}
          selected={selectedWidgetType === w.type}
          onClick={() => onAdd(w.type, w.size)}
        />
      );
    });

  const marketplaceHeader = (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionHeaderLabel}>Marketplace</span>
      <span className={styles.sectionHeaderTag}>BETA</span>
    </div>
  );

  return (
    <div
      className={rootClass}
      data-theme={themeMode}
      data-surface={surface}
      style={{ ...themeStyle, ...panelGridVars }}
    >
      {searchable && (
        <div className={styles.search}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('panel.add.searchPlaceholder')}
            // Focus on the desktop modal and the desktop dashboard's add-widget
            // sheet (which uses the default 'panel-sheet' variant). Touch panels
            // (phone/y70/q60) stay unfocused so the on-screen keyboard doesn't
            // pop up.
            autoFocus={variant === 'desktop-modal' || surface === 'desktop'}
          />
        </div>
      )}
      <div className={styles.scroller}>
        {/* Built-ins and marketplace are separate panel grids so the section
            header sits between them. */}
        <div ref={measureRef} className={styles.propWrap}>
          <div className={panelStyles.grid}>{renderPacked(visibleBuiltIns)}</div>
          {visibleMarketplace.length > 0 && marketplaceHeader}
          {visibleMarketplace.length > 0 && (
            <div className={panelStyles.grid}>{renderPacked(visibleMarketplace)}</div>
          )}
          {visibleCount === 0 && <div className={styles.empty}>{t('panel.add.noMatches')}</div>}
        </div>
      </div>
    </div>
  );
}

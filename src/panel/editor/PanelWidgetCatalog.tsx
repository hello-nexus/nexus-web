import { useEffect, useLayoutEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { ChipGroup } from '../../components/common/ChipGroup/ChipGroup';
import { SearchInput } from '../../components/common/SearchInput/SearchInput';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useTranslation } from '../../lib/i18n';
import { singleWidgetSurfaceSize, surfaceSupportsTextInput, type PanelLayout, type PanelSurface, type PanelWidget, type PanelWidgetSize } from '../types';
import { PANEL_GRID_GAP, sizeToSpan } from '../engine/grid';
import { PHONE_WIDGET_REFERENCE_CELL } from '../engine/panelGrid';
import { appendWidget } from '../engine/panelLayoutOps';
import { getCatalogEntries, pickerSizeFor, sizesForSurface, appAvailableForSurface } from '../widgets/registry';
import {
  isMarketplaceRegistryStale,
  loadMarketplaceApps,
  subscribeMarketplaceRegistry,
} from '../../widgets/marketplaceRegistry';
import { DEV_TOOLS } from '../../lib/devTools';
import { PanelCatalogCell } from '../dnd/PanelDragCells';
import { SIZE_ICONS } from '../widgets/common/SizeIcons';
import panelStyles from '../PanelApp.module.scss';
import styles from './PanelWidgetCatalog.module.scss';

// The catalog IS a panel grid. The column count is a multiple of 4 sized so
// each cell lands near this target, then widgets pack row-major via the panel's
// appendWidget and render through the panel's own cell (PanelCatalogCell) - same
// scaling, label sizing, and fill as the live panel. Tune for tile size: a
// narrow add-widget sheet lands on 4 columns (like the phone panel); wider
// device-page panes step up to 8 / 12.
const CATALOG_TARGET_CELL = 100;

// Browse-size preference: which of the common 2x2/4x2 pair the catalog
// previews (and inserts) when the widget supports it on the surface.
// Widgets without the preferred size keep their own shape.
const CATALOG_SIZE_KEY = 'nexus.catalog.preferredSize';
type CatalogPreferredSize = '2x2' | '4x2';

const TwoByTwoIcon = SIZE_ICONS['2x2'];
const FourByTwoIcon = SIZE_ICONS['4x2'];

// Icon-only chips; the size tokens ride as aria-labels, identical across
// locales. The shared glyphs draw inside a square viewBox, which visually
// shrinks the 4x2's wide footprint at chip scale - the viewBox overrides
// crop each glyph to its drawn bounds so the 4x2 renders wider than tall.
const SIZE_PREF_ICONS = {
  '2x2': <TwoByTwoIcon width={16} height={16} viewBox="2 2 28 28" aria-hidden="true" />,
  '4x2': <FourByTwoIcon width={21} height={16} viewBox="0 4 32 24" aria-hidden="true" />,
} as const;

const SIZE_PREF_KEYS: readonly CatalogPreferredSize[] = ['2x2', '4x2'];

type CatalogEntry = ReturnType<typeof getCatalogEntries>[number];

export interface PanelWidgetCatalogProps {
  surface: PanelSurface;
  onAdd: (type: string, size: PanelWidgetSize) => void;
  // Whether the target grid still has a free slot for a widget of a given
  // size. Cards that would not fit are dimmed and unclickable, with a notice
  // naming the reason. Omitted on surfaces that can spill onto a new page:
  // they are never full, so nothing is dimmed.
  canAddSize?: (size: PanelWidgetSize) => boolean;
  searchable?: boolean;
  variant?: 'panel-sheet' | 'desktop-modal';
  // The target panel connects over the network (paired phone/browser/app), so
  // local-only widgets are hidden.
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
  // Per-device touch capability (promoted monitors): touch-requiring widgets
  // are listed only when the device's display actually has a digitizer.
  deviceTouch?: boolean;
}

export function PanelWidgetCatalog({
  surface,
  onAdd,
  canAddSize,
  searchable = true,
  variant = 'panel-sheet',
  remote = false,
  themeMode,
  themeStyle,
  className,
  selectedWidgetType,
  deviceTouch,
}: PanelWidgetCatalogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [preferredSize, setPreferredSize] = usePersistentState<CatalogPreferredSize>(CATALOG_SIZE_KEY, '2x2');
  const changePreferredSize = (key: string) => setPreferredSize(key === '4x2' ? '4x2' : '2x2');
  const sizePrefOptions = SIZE_PREF_KEYS.map(size => ({
    key: size,
    label: SIZE_PREF_ICONS[size],
    ariaLabel: size,
    tooltip: t('panel.add.preferSize', { size }),
  }));
  // Force re-render on marketplace registry refresh - the catalog reads a
  // module-level cache React can't observe without an explicit subscription.
  const forceRender = useReducer((r: number) => r + 1, 0)[1];
  const normalised = query.trim().toLowerCase();

  useEffect(() => {
    if (isMarketplaceRegistryStale()) {
      void loadMarketplaceApps();
    }
    return subscribeMarketplaceRegistry(forceRender);
  }, [forceRender]);

  // Capability-filtered picker source. On beta/prod `meta.listed === false`
  // delists an app (built-in delisted inline, SDK app derived from the
  // marketplace allowlist). DEV_TOOLS builds bypass the curation so every
  // installed widget is browseable for testing - same one flag that gates the
  // Tools page and relay. Already-placed instances always render via lookupApp;
  // listed apps co-mingle in one grid - no separate section.
  const entries = getCatalogEntries().filter(([, def]) => {
    if (!appAvailableForSurface(def.meta, surface, { remote, deviceTouch })) return false;
    return DEV_TOOLS || def.meta.listed !== false;
  });
  const matchesSearch = (type: string, def: { meta: { i18nKey: string } }) => {
    if (!normalised) return true;
    const label = (t(def.meta.i18nKey) || type).toLowerCase();
    return label.includes(normalised) || type.toLowerCase().includes(normalised);
  };
  const visible = entries.filter(([type, def]) => matchesSearch(type, def));
  const visibleCount = visible.length;

  const rootClass = [
    'panel-root',
    styles.root,
    variant === 'desktop-modal' ? styles.desktop : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  // No search field on a keyboard-less surface (Y70 kiosk, Q-series): it
  // can't be typed into on-device. A desktop modal editing such a panel
  // keeps it: the operator types on their own keyboard, not the target
  // surface's. The size chips are tap-driven so they stay; single-widget
  // surfaces are locked to one size and get no chips.
  const showSearch = searchable && (variant === 'desktop-modal' || surfaceSupportsTextInput(surface));
  const showSizeChips = singleWidgetSurfaceSize(surface) === undefined;

  // Measure the available width, then pick a multiple-of-4 column count sized so
  // each cell sits near the target. Cell size drives the panel grid vars below.
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  // Layout effect so the first paint already has the measured column count -
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
  // sizing, and gap - one rendering path, identical to the panel. Always set
  // (cols/cellSize fall back to 4 / target before the first measure) so
  // `--panel-columns` is never undefined, which would collapse the grid.
  const panelGridVars: CSSProperties = {
    '--panel-columns': cols,
    '--panel-cell-size': `${cellSize}px`,
    '--panel-row-size': `${cellSize}px`,
    '--panel-content-scale': `${cellSize}px`,
    // Plain-number scale (cell / 90px design base). The default token derives
    // this via CSS trig (`tan(atan2(...))`), which `scale()` reads but the cell
    // scaler's `width: calc(inner / scale)` division does NOT evaluate -
    // leaving widget content scaled down without compensation. A number fills.
    '--panel-scale': cellSize / PHONE_WIDGET_REFERENCE_CELL,
    '--panel-gap': `${gap}px`,
  } as CSSProperties;

  // Pack an ordered entry list into `cols` columns the way the panel does:
  // row-major first-free-rect on a single page (no implicit new pages). 1x1
  // widgets are held back and laid out left-to-right on fresh rows BELOW
  // everything else, so the smallest tiles always group at the bottom of the
  // grid instead of back-filling gaps higher up.
  // Picker size for a widget: the user's preferred browse size when the
  // widget supports it on this surface, else the widget's own picker size
  // (sole-size widgets and single-widget surfaces keep their shape).
  const pickSize = (meta: CatalogEntry[1]['meta']): PanelWidgetSize => {
    if (sizesForSurface(meta, surface, deviceTouch).includes(preferredSize)) {
      return preferredSize;
    }
    return pickerSizeFor(meta, surface, deviceTouch);
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
  // Each probe is a full placement scan, and only a handful of distinct sizes
  // ever reach it; cache per render so a search keystroke does not rescan.
  const fitCache = new Map<PanelWidgetSize, boolean>();
  const fits = (size: PanelWidgetSize) => {
    if (!canAddSize) return true;
    const cached = fitCache.get(size);
    if (cached !== undefined) return cached;
    const value = canAddSize(size);
    fitCache.set(size, value);
    return value;
  };
  const renderPacked = (items: CatalogEntry[]) =>
    packEntries(items).map(w => {
      const def = defByType.get(w.type);
      const addable = fits(w.size);
      return (
        <PanelCatalogCell
          key={w.id}
          widget={w}
          surface={surface}
          deviceTouch={deviceTouch}
          label={def ? t(def.meta.i18nKey) || w.type : w.type}
          selected={selectedWidgetType === w.type}
          disabled={!addable}
          onClick={() => onAdd(w.type, w.size)}
        />
      );
    });

  // Cards are dimmed at the size they would actually insert at (pickSize), so
  // the notice counts the same sizes the grid renders.
  const unaddableCount = canAddSize
    ? visible.filter(([, def]) => !fits(pickSize(def.meta))).length
    : 0;
  // Fullness is a property of the grid, not of what is on screen: search and
  // the size chips both narrow `visible` to sets that can all miss while the
  // grid still has a hole. Probe the smallest size instead - nothing fitting
  // 1x1 is the only state the user cannot resolve from inside the catalog.
  const gridFull = canAddSize ? !fits('1x1') : false;
  const noticeKey = unaddableCount === 0
    ? null
    : gridFull ? 'panel.add.full' : 'panel.add.someTooLarge';

  // The widget browser always renders cards opaque; the device's widget-opacity
  // setting applies only on-device and in the device preview, not while browsing.
  const catalogStyle = {
    ...themeStyle,
    ...panelGridVars,
    '--panel-card-bg-opacity': '100%',
  } as CSSProperties;

  return (
    <div
      className={rootClass}
      data-theme={themeMode}
      data-surface={surface}
      style={catalogStyle}
    >
      {(showSearch || showSizeChips) && (
        <div className={styles.search}>
          {showSearch && (
            <SearchInput
              className={styles.searchInput}
              value={query}
              onChange={setQuery}
              placeholder={t('panel.add.searchPlaceholder')}
              // Autofocus only where a keyboard is present and focus is wanted:
              // the desktop modal and the desktop dashboard's add-widget sheet.
              // The phone renders the field but stays unfocused so the on-screen
              // keyboard doesn't pop up.
              autoFocus={variant === 'desktop-modal' || surface === 'desktop'}
            />
          )}
          {showSizeChips && (
            <ChipGroup
              className={styles.sizeChips}
              ariaLabel={t('panel.add.sizePreference')}
              options={sizePrefOptions}
              activeKey={preferredSize}
              onChange={changePreferredSize}
            />
          )}
        </div>
      )}
      {/* Mounted empty and filled on change: a live region inserted with its
          text already in place is not reliably announced, and the transition
          that matters (a size chip making the notice appear) is exactly that
          case. */}
      <div className={styles.noticeRegion} role="status">
        {noticeKey && <div className={styles.notice}>{t(noticeKey)}</div>}
      </div>
      <div className={styles.scroller}>
        <div ref={measureRef} className={styles.propWrap}>
          <div className={panelStyles.grid}>{renderPacked(visible)}</div>
          {visibleCount === 0 && <div className={styles.empty}>{t('panel.add.noMatches')}</div>}
        </div>
      </div>
    </div>
  );
}

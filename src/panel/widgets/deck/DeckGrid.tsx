import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Undo2, Plus, Trash2 } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useTranslation } from '../../../lib/i18n';
import { DeviceContextMenu, type DeviceMenuItem } from '../../../components/common/DeviceCanvas/DeviceContextMenu';
import { useAppIcon } from '../common/AppPicker';
import { useSiteIcon } from './useSiteIcon';
import { useDeckImage } from './useDeckImage';
import { DECK_ICONS, autoIconName, deckCategory, categoryColor, slotAppId, slotSiteUrl } from './deckIcons';
import { resolveDeckTitleStyle, titleFontSizeCss } from './deckTitleStyle';
import { DeckMonitoringCell } from './DeckMonitoringCell';
import { DeckWeatherCell } from './DeckWeatherCell';
import { DECK_MONITORING_TILE_BG } from './deckMonitoring';
import { slotPathAt } from './deckTarget';
import type { DeckSlot } from './types';
import styles from './DeckGrid.module.scss';

function renderLucide(name: string) {
  const Comp = DECK_ICONS[name] ?? Plus;
  // eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute
  return <Comp aria-hidden="true" />;
}

const LABEL_ALIGN_CLASS = {
  top: 'labelAlignTop',
  middle: 'labelAlignMiddle',
  bottom: 'labelAlignBottom',
} as const;

/**
 * Visual content (icon + optional label) + the accent for a slot. `liveSrc`
 * is a data URI from the service's own key renderer (DeckGrid's liveTiles,
 * now pushed for EVERY key on a physical deck) - when set, ANY slot kind
 * shows that frame instead of drawing its own CSS tile, so the physical
 * editor preview matches the hardware key by construction; a monitoring/
 * weather slot falls back to its own live CSS tile only until the first
 * frame arrives.
 */
function useCellVisual(slot: DeckSlot, liveSrc?: string, square?: boolean): { accent: string; content: ReactNode; empty: boolean } {
  const action = slot.action;
  const isFolder = !!slot.folder;
  const icon = slot.icon;
  const appId = slotAppId(icon, action);
  const appIconUrl = useAppIcon(appId); // unconditional (null for undefined appId)
  const siteIconUrl = useSiteIcon(slotSiteUrl(action)); // unconditional (null for a non-url action)
  const imageIconUrl = useDeckImage(icon?.kind === 'image' ? icon.value : undefined); // unconditional
  // A slot with an explicit icon isn't "empty" even before an action is chosen,
  // so a picked icon renders immediately (not only after picking an action).
  const empty = !action && !isFolder && !icon;
  const monitoringOrWeather = action?.type === 'monitoring' || action?.type === 'weather';

  // liveTiles is keyed by position and only cleared wholesale on a topology
  // change (preset load/undo/redo/reset), so a slot just cleared by itself
  // (not through one of those) can still carry a stale entry at its key -
  // never let that force a truly empty slot to render (and drag-enable) as
  // if it still held the old content.
  if (liveSrc && !empty) {
    const liveAlt = slot.label
      || (action?.type === 'monitoring' ? action.labelText : action?.type === 'weather' ? action.city : undefined)
      || '';
    return {
      accent: slot.color ?? (monitoringOrWeather ? DECK_MONITORING_TILE_BG : categoryColor(isFolder ? 'folder' : deckCategory(action))),
      content: <img src={liveSrc} draggable={false} alt={liveAlt} className={styles.customImage} />,
      empty: false,
    };
  }

  // A monitoring tile draws its own name/graph/value content (never
  // slot.icon). It's never "empty" (always shows a
  // live or placeholder reading) and uses a near-black default accent instead
  // of the auto category color, since it has no icon to color-code.
  if (action?.type === 'monitoring') {
    return { accent: slot.color ?? DECK_MONITORING_TILE_BG, content: <DeckMonitoringCell action={action} title={slot.title} />, empty: false };
  }

  if (action?.type === 'weather') {
    return { accent: slot.color ?? DECK_MONITORING_TILE_BG, content: <DeckWeatherCell action={action} title={slot.title} />, empty: false };
  }

  let iconEl: ReactNode;
  let appIconFills = false;
  if (icon?.kind === 'emoji') {
    iconEl = <span className={styles.emoji}>{icon.value}</span>;
  } else if (icon?.kind === 'lucide') {
    iconEl = <span className={styles.icon}>{renderLucide(icon.value)}</span>;
  } else if (icon?.kind === 'image') {
    iconEl = imageIconUrl ? <img src={imageIconUrl} className={styles.customImage} alt="" /> : null;
  } else if (appId) {
    if (appIconUrl) {
      // On the touch widget a loaded app icon IS the key face: full size, no
      // accent fill behind it. Applies to every /shortcuts/icon source
      // (launchApp, an explicit app icon, an openFile exe). The physical
      // preview (square) keeps the glyph-on-accent look so it still matches
      // the service's own hardware-key render.
      appIconFills = !square;
      iconEl = <img src={appIconUrl} className={appIconFills ? styles.appIconFull : styles.appIcon} alt="" />;
    } else {
      // An icon-only app slot has no action to derive a glyph from, so it keeps
      // the app placeholder rather than autoIconName's add-a-key Plus.
      iconEl = <span className={styles.icon}>{renderLucide(action ? autoIconName(action, isFolder) : 'AppWindow')}</span>;
    }
  } else if (siteIconUrl) {
    iconEl = <img src={siteIconUrl} className={styles.appIcon} alt="" />;
  } else if (!empty) {
    iconEl = <span className={styles.icon}>{renderLucide(autoIconName(action, isFolder))}</span>;
  } else {
    iconEl = null;
  }

  const accent = slot.color ?? (appIconFills ? 'transparent' : categoryColor(isFolder ? 'folder' : deckCategory(action)));
  const titleStyle = resolveDeckTitleStyle(slot.title);
  const content = (
    <>
      <span className={styles.iconWrap}>{iconEl}</span>
      {slot.label && titleStyle.show ? (
        <span
          className={`${styles.label} ${styles[LABEL_ALIGN_CLASS[titleStyle.align]]}`}
          style={{
            fontSize: titleFontSizeCss(titleStyle.size),
            fontFamily: titleStyle.fontFamily || undefined,
            fontWeight: titleStyle.bold ? 700 : undefined,
            fontStyle: titleStyle.italic ? 'italic' : undefined,
            textDecoration: titleStyle.underline ? 'underline' : undefined,
            color: titleStyle.color,
          }}
        >
          {slot.label}
        </span>
      ) : null}
    </>
  );
  return { accent, content, empty };
}

interface CellProps {
  slot: DeckSlot;
  index: number;
  selectable: boolean;
  selected: boolean;
  onClick: () => void;
  /** Right-click on a non-empty cell; omitted when the grid offers no delete action. */
  onCellContextMenu?: (e: ReactMouseEvent<HTMLButtonElement>, index: number, empty: boolean) => void;
  /** See useCellVisual's liveSrc param. */
  liveSrc?: string;
  /** See DeckGridProps.square. */
  square?: boolean;
}

/** Run/select cell (no drag). */
function StaticCell({ slot, index, selectable, selected, onClick, onCellContextMenu, liveSrc, square }: CellProps) {
  const { accent, content, empty } = useCellVisual(slot, liveSrc, square);
  if (empty && !selectable) {
    return <div className={`${styles.cell} ${styles.empty}`} data-deck-slot-index={index} />;
  }
  return (
    <button
      type="button"
      data-deck-slot-index={index}
      className={cellClass(empty, selectable, selected)}
      style={{ '--deck-accent': accent } as CSSProperties}
      aria-pressed={selectable ? selected : undefined}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onPointerDown={e => e.stopPropagation()}
      onContextMenu={e => { if (selectable) e.stopPropagation(); if (!slot.auto) onCellContextMenu?.(e, index, empty); }}
    >
      {content}
    </button>
  );
}

/** Edit-mode cell: draggable (if it has content) + droppable, plus selectable.
 *  A synthesized page-nav key (slot.auto) is read-only - fitToGrid inserted
 *  it, and DeckTarget.updateSlot/swapSlots silently refuse to touch it, so
 *  neither drag nor the delete context menu is offered on it. */
function DraggableCell({ slot, index, selected, onClick, onCellContextMenu, liveSrc, square }: CellProps) {
  const { accent, content, empty } = useCellVisual(slot, liveSrc, square);
  const id = String(index);
  const drag = useDraggable({ id, disabled: empty || !!slot.auto });
  const drop = useDroppable({ id });
  const setRef = (el: HTMLElement | null) => { drag.setNodeRef(el); drop.setNodeRef(el); };
  const style: CSSProperties = {
    '--deck-accent': accent,
    transform: drag.transform ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` : undefined,
    zIndex: drag.isDragging ? 5 : undefined,
    opacity: drag.isDragging ? 0.85 : undefined,
  } as CSSProperties;
  return (
    <button
      ref={setRef}
      type="button"
      {...drag.attributes}
      {...drag.listeners}
      data-deck-slot-index={index}
      className={`${cellClass(empty, true, selected)} ${drop.isOver && !drag.isDragging ? styles.dropOver : ''}`}
      style={style}
      aria-pressed={selected}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onContextMenu={e => { e.stopPropagation(); if (!slot.auto) onCellContextMenu?.(e, index, empty); }}
    >
      {content}
    </button>
  );
}

function cellClass(empty: boolean, selectable: boolean, selected: boolean) {
  return [
    styles.cell,
    empty ? styles.empty : '',
    selectable ? styles.selectable : '',
    selected ? styles.selected : '',
  ].filter(Boolean).join(' ');
}

export interface DeckGridBackCell {
  onBack: () => void;
  ariaLabel: string;
}

export interface DeckGridProps {
  slots: DeckSlot[];
  cols: number;
  rows: number;
  selectable: boolean;
  dragEnabled?: boolean;
  selectedIndex?: number;
  onCell: (index: number) => void;
  /**
   * Reserves the first grid cell for a Back affordance instead of a slot: a
   * physical Stream Deck has no room to overlay Back like the touch widget
   * does (DeckWidget's floating corner button), so a folder view on hardware
   * dedicates its top-left key to it. `slots` should already be sized to
   * one fewer than cols*rows when this is set.
   */
  backCell?: DeckGridBackCell;
  /**
   * Fixed square keys at a device-like size, centered, instead of stretching
   * cells to fill the container. Used by the physical Stream Deck editor so the
   * grid mirrors the hardware's square-button layout; the touch widget leaves
   * this off and fills its tile.
   */
  square?: boolean;
  /**
   * Right-click delete: when set, a non-empty cell's context menu (reusing
   * DeviceContextMenu, the lighting device canvas's menu) offers a Delete
   * action that reports the picked index back here. The caller decides what
   * clearing means (a direct clear vs. a confirm for a folder with bound
   * content), matching the existing delete affordance elsewhere in the same
   * editor.
   */
  onDeleteSlot?: (index: number) => void;
  /**
   * Live-rendered key frames pushed by the service's own tile renderer (the
   * 'streamdeckTiles' multiplex topic), keyed `${page}:${slotPath}` (slotPath
   * per slotPathAt) to a data:image/jpeg;base64 URI - set only by the
   * physical Stream Deck editor's preview grid, so a monitoring/weather cell
   * renders byte-identical to the hardware key instead of the CSS tile. Requires
   * `page`/`folderPath` alongside it so each cell can compute its own key;
   * absent (or no matching frame yet) falls back to the CSS tile.
   */
  liveTiles?: ReadonlyMap<string, string>;
  page?: number;
  folderPath?: readonly number[];
}

/** Pure icon grid for one folder level. The back affordance is overlaid by DeckWidget. */
export function DeckGrid({ slots, cols, rows, selectable, dragEnabled, selectedIndex, onCell, backCell, square, onDeleteSlot, liveTiles, page, folderPath }: DeckGridProps) {
  const { t } = useTranslation();
  const [ctxMenu, setCtxMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const Cell = dragEnabled ? DraggableCell : StaticCell;
  const trackSize = square ? 'var(--deck-cell)' : '1fr';
  const liveSrcFor = (index: number): string | undefined =>
    liveTiles && page != null && folderPath ? liveTiles.get(`${page}:${slotPathAt(folderPath, index)}`) : undefined;

  const handleCellContextMenu = onDeleteSlot
    ? (e: ReactMouseEvent<HTMLButtonElement>, index: number, empty: boolean) => {
        if (empty) return;
        e.preventDefault();
        setCtxMenu({ index, x: e.clientX, y: e.clientY });
      }
    : undefined;

  const deleteMenuItems: DeviceMenuItem[] = ctxMenu && onDeleteSlot ? [{
    key: 'delete',
    // eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute
    icon: <Trash2 size={14} aria-hidden="true" />,
    label: t('common.delete'),
    onSelect: () => onDeleteSlot(ctxMenu.index),
  }] : [];

  return (
    <div
      className={square ? `${styles.grid} ${styles.square}` : styles.grid}
      style={{ gridTemplateColumns: `repeat(${cols}, ${trackSize})`, gridTemplateRows: `repeat(${rows}, ${trackSize})`, '--deck-cols': cols } as CSSProperties}
    >
      {backCell && (
        <button
          type="button"
          className={`${styles.cell} ${styles.backCellButton}`}
          aria-label={backCell.ariaLabel}
          onClick={e => { e.stopPropagation(); backCell.onBack(); }}
        >
          {/* eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute */}
          <Undo2 aria-hidden="true" />
        </button>
      )}
      {slots.map((slot, i) => (
        <Cell
          key={i}
          // square = hardware mirror: a 'transparent' background uploads as
          // off-black (JPEG/BMP encoding drops the alpha), so preview it that way.
          slot={square && slot.color === 'transparent' ? { ...slot, color: '#000000' } : slot}
          index={i}
          selectable={selectable}
          selected={selectable && i === selectedIndex}
          onClick={() => onCell(i)}
          onCellContextMenu={handleCellContextMenu}
          liveSrc={liveSrcFor(i)}
          square={square}
        />
      ))}
      {ctxMenu && onDeleteSlot && (
        <DeviceContextMenu
          key={`${ctxMenu.index}:${ctxMenu.x}:${ctxMenu.y}`}
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={deleteMenuItems}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

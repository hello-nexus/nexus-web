import { useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Undo2, Plus, Trash2 } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useTranslation } from '../../../lib/i18n';
import { DeviceContextMenu, type DeviceMenuItem } from '../../../components/common/DeviceCanvas/DeviceContextMenu';
import { useAppIcon } from '../common/AppPicker';
import { useDeckImage } from './useDeckImage';
import { DECK_ICONS, autoIconName, deckCategory, categoryColor } from './deckIcons';
import { resolveDeckTitleStyle, titleFontSizeCss } from './deckTitleStyle';
import { DeckMonitoringCell } from './DeckMonitoringCell';
import { DeckWeatherCell } from './DeckWeatherCell';
import { DECK_MONITORING_TILE_BG } from './deckMonitoring';
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

/** Visual content (icon + optional label) + the accent for a slot. */
function useCellVisual(slot: DeckSlot): { accent: string; content: ReactNode; empty: boolean } {
  const action = slot.action;
  const isFolder = !!slot.folder;
  const icon = slot.icon;
  const appId = action?.type === 'launchApp' ? action.appId : icon?.kind === 'app' ? icon.value : undefined;
  const appIconUrl = useAppIcon(appId); // unconditional (null for undefined appId)
  const imageIconUrl = useDeckImage(icon?.kind === 'image' ? icon.value : undefined); // unconditional
  // A slot with an explicit icon isn't "empty" even before an action is chosen,
  // so a picked icon renders immediately (not only after picking an action).
  const empty = !action && !isFolder && !icon;

  // A monitoring tile draws its own name/graph/value content (never
  // slot.icon) - see the tile layout contract in
  // plans/deck-monitoring-and-presets.md. It's never "empty" (always shows a
  // live or placeholder reading) and uses a near-black default accent instead
  // of the auto category color, since it has no icon to color-code.
  if (action?.type === 'monitoring') {
    return {
      accent: slot.color ?? DECK_MONITORING_TILE_BG,
      content: <DeckMonitoringCell action={action} title={slot.title} />,
      empty: false,
    };
  }

  if (action?.type === 'weather') {
    return {
      accent: slot.color ?? DECK_MONITORING_TILE_BG,
      content: <DeckWeatherCell action={action} title={slot.title} />,
      empty: false,
    };
  }

  let iconEl: ReactNode;
  if (icon?.kind === 'emoji') {
    iconEl = <span className={styles.emoji}>{icon.value}</span>;
  } else if (icon?.kind === 'lucide') {
    iconEl = <span className={styles.icon}>{renderLucide(icon.value)}</span>;
  } else if (icon?.kind === 'image') {
    iconEl = imageIconUrl ? <img src={imageIconUrl} className={styles.customImage} alt="" /> : null;
  } else if (appId) {
    iconEl = appIconUrl
      ? <img src={appIconUrl} className={styles.appIcon} alt="" />
      : <span className={styles.icon}>{renderLucide('AppWindow')}</span>;
  } else if (!empty) {
    iconEl = <span className={styles.icon}>{renderLucide(autoIconName(action, isFolder))}</span>;
  } else {
    iconEl = null;
  }

  const accent = slot.color ?? categoryColor(isFolder ? 'folder' : deckCategory(action));
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
}

/** Run/select cell (no drag). */
function StaticCell({ slot, index, selectable, selected, onClick, onCellContextMenu }: CellProps) {
  const { accent, content, empty } = useCellVisual(slot);
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
      onContextMenu={e => { if (selectable) e.stopPropagation(); onCellContextMenu?.(e, index, empty); }}
    >
      {content}
    </button>
  );
}

/** Edit-mode cell: draggable (if it has content) + droppable, plus selectable. */
function DraggableCell({ slot, index, selected, onClick, onCellContextMenu }: CellProps) {
  const { accent, content, empty } = useCellVisual(slot);
  const id = String(index);
  const drag = useDraggable({ id, disabled: empty });
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
      onContextMenu={e => { e.stopPropagation(); onCellContextMenu?.(e, index, empty); }}
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
}

/** Pure icon grid for one folder level. The back affordance is overlaid by DeckWidget. */
export function DeckGrid({ slots, cols, rows, selectable, dragEnabled, selectedIndex, onCell, backCell, square, onDeleteSlot }: DeckGridProps) {
  const { t } = useTranslation();
  const [ctxMenu, setCtxMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const Cell = dragEnabled ? DraggableCell : StaticCell;
  const trackSize = square ? 'var(--deck-cell)' : '1fr';

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
          slot={slot}
          index={i}
          selectable={selectable}
          selected={selectable && i === selectedIndex}
          onClick={() => onCell(i)}
          onCellContextMenu={handleCellContextMenu}
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

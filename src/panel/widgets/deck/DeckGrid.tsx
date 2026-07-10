import type { CSSProperties, ReactNode } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useAppIcon } from '../common/AppPicker';
import { DECK_ICONS, autoIconName, deckCategory, categoryColor } from './deckIcons';
import type { DeckSlot } from './types';
import styles from './DeckGrid.module.scss';

function renderLucide(name: string) {
  const Comp = DECK_ICONS[name] ?? Plus;
  // eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute
  return <Comp aria-hidden="true" />;
}

/** Visual content (icon + optional label) + the accent for a slot. */
function useCellVisual(slot: DeckSlot): { accent: string; content: ReactNode; empty: boolean } {
  const action = slot.action;
  const isFolder = !!slot.folder;
  const icon = slot.icon;
  const appId = action?.type === 'launchApp' ? action.appId : icon?.kind === 'app' ? icon.value : undefined;
  const appIconUrl = useAppIcon(appId); // unconditional (null for undefined appId)
  // A slot with an explicit icon isn't "empty" even before an action is chosen,
  // so a picked icon renders immediately (not only after picking an action).
  const empty = !action && !isFolder && !icon;

  let iconEl: ReactNode;
  if (icon?.kind === 'emoji') {
    iconEl = <span className={styles.emoji}>{icon.value}</span>;
  } else if (icon?.kind === 'lucide') {
    iconEl = <span className={styles.icon}>{renderLucide(icon.value)}</span>;
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
  const content = (
    <>
      <span className={styles.iconWrap}>{iconEl}</span>
      {slot.label ? <span className={styles.label}>{slot.label}</span> : null}
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
}

/** Run/select cell (no drag). */
function StaticCell({ slot, index, selectable, selected, onClick }: CellProps) {
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
      onContextMenu={e => { if (selectable) e.stopPropagation(); }}
    >
      {content}
    </button>
  );
}

/** Edit-mode cell: draggable (if it has content) + droppable, plus selectable. */
function DraggableCell({ slot, index, selected, onClick }: CellProps) {
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
      onContextMenu={e => e.stopPropagation()}
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
}

/** Pure icon grid for one folder level. The back affordance is overlaid by DeckWidget. */
export function DeckGrid({ slots, cols, rows, selectable, dragEnabled, selectedIndex, onCell, backCell }: DeckGridProps) {
  const Cell = dragEnabled ? DraggableCell : StaticCell;
  return (
    <div
      className={styles.grid}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
    >
      {backCell && (
        <button
          type="button"
          className={`${styles.cell} ${styles.backCellButton}`}
          aria-label={backCell.ariaLabel}
          onClick={e => { e.stopPropagation(); backCell.onBack(); }}
        >
          {/* eslint-disable-next-line i18next/no-literal-string -- ARIA boolean attribute */}
          <ChevronLeft aria-hidden="true" />
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
        />
      ))}
    </div>
  );
}

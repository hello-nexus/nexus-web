import type { CSSProperties } from 'react';
import { Plus } from 'lucide-react';
import { useAppIcon } from '../common/AppPicker';
import { DECK_ICONS, autoIconName, deckCategory, categoryColor } from './deckIcons';
import type { DeckSlot } from './types';
import styles from './DeckGrid.module.scss';

function renderLucide(name: string) {
  const Comp = DECK_ICONS[name] ?? Plus;
  return <Comp aria-hidden="true" />;
}

interface DeckButtonProps {
  slot: DeckSlot;
  index: number;
  showLabels: boolean;
  selectable: boolean;
  selected: boolean;
  onClick: () => void;
}

function DeckButton({ slot, index, showLabels, selectable, selected, onClick }: DeckButtonProps) {
  const action = slot.action;
  const isFolder = !!slot.folder;
  const icon = slot.icon;
  const appId = action?.type === 'launchApp' ? action.appId : icon?.kind === 'app' ? icon.value : undefined;
  // Hook called unconditionally (returns null for undefined appId).
  const appIconUrl = useAppIcon(appId);
  const empty = !action && !isFolder;

  if (empty && !selectable) {
    return <div className={`${styles.cell} ${styles.empty}`} data-deck-slot-index={index} />;
  }

  const accent = slot.color ?? categoryColor(isFolder ? 'folder' : deckCategory(action));

  let iconEl: React.ReactNode;
  if (icon?.kind === 'emoji') {
    iconEl = <span className={styles.emoji}>{icon.value}</span>;
  } else if (appId) {
    iconEl = appIconUrl
      ? <img src={appIconUrl} className={styles.appIcon} alt="" />
      : <span className={styles.icon}>{renderLucide('AppWindow')}</span>;
  } else {
    const name = icon?.kind === 'lucide' ? icon.value : autoIconName(action, isFolder);
    iconEl = <span className={styles.icon}>{renderLucide(name)}</span>;
  }

  const cls = [
    styles.cell,
    empty ? styles.empty : '',
    selectable ? styles.selectable : '',
    selected ? styles.selected : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      data-deck-slot-index={index}
      className={cls}
      style={{ '--deck-accent': accent } as CSSProperties}
      aria-pressed={selectable ? selected : undefined}
      onClick={event => { event.stopPropagation(); onClick(); }}
      onPointerDown={event => event.stopPropagation()}
      onContextMenu={event => { if (selectable) event.stopPropagation(); }}
    >
      {iconEl}
      {showLabels && slot.label ? <span className={styles.label}>{slot.label}</span> : null}
    </button>
  );
}

export interface DeckGridProps {
  slots: DeckSlot[];
  cols: number;
  rows: number;
  showLabels: boolean;
  selectable: boolean;
  selectedIndex?: number;
  onCell: (index: number) => void;
}

/** Pure icon grid for one page/folder. Back button + page dots are overlaid by DeckWidget. */
export function DeckGrid({ slots, cols, rows, showLabels, selectable, selectedIndex, onCell }: DeckGridProps) {
  return (
    <div
      className={styles.grid}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
    >
      {slots.map((slot, i) => (
        <DeckButton
          key={i}
          slot={slot}
          index={i}
          showLabels={showLabels}
          selectable={selectable}
          selected={selectable && i === selectedIndex}
          onClick={() => onCell(i)}
        />
      ))}
    </div>
  );
}

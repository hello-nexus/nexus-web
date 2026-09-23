import { type ReactNode } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import classNames from 'classnames';
import {
  DndContext, type DragEndEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, type SortingStrategy, useSortable,
  sortableKeyboardCoordinates, arrayMove,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { NexusControlOffIcon } from '../NexusControlOffIcon/NexusControlOffIcon';
import type { ServiceState } from '../../../hooks/useServiceState';
import styles from './Sidebar.module.scss';

interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  // Pre-resolved tooltip; when set, renders the same disabled glyph as a device row's Nexus Control off (SidebarDevicesSection).
  readonly offTooltip?: string;
}

interface ExtraNavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly href?: string;
}

interface SidebarProps {
  items: readonly NavItem[];
  active: string;
  onChange: (key: string) => void;
  // Text of the section header rendered above `items`. When
  // `onSectionLabelClick` is also provided the header is a button with the
  // same active accent treatment as a selected item (APPS = dashboard).
  sectionLabel: string;
  // Icon rendered in the header row's nav-row icon slot (grid for APPS,
  // usb for DEVICES). Same 18px lucide glyph the nav rows use.
  sectionIcon?: ReactNode;
  onSectionLabelClick?: () => void;
  sectionLabelActive?: boolean;
  serviceState: ServiceState;
  headerSlot?: ReactNode;
  compact?: boolean;
  extraItems?: readonly ExtraNavItem[];
  extraSectionLabel?: string;
  extraActive?: string;
  extraOnChange?: (key: string) => void;
  // Fires with the whole arrangement after a drop: `pinned` is the order above
  // the separator, `lower` the order below it; a row dragged across the
  // separator moves between the two. When omitted, rows are non-sortable.
  onArrange?: (next: { pinned: string[]; lower: string[] }) => void;
  // Optional context-menu hook fired by a right-click on a pinned or lower row.
  onItemContextMenu?: (key: string, event: React.MouseEvent) => void;
  // Every unpinned app, in display order, below a hairline separator.
  lowerItems?: readonly NavItem[];
  // Optional content rendered inside the scrollable region after the
  // items. Used by SidebarColumn to slot the DEVICES section below
  // APPS so both share one scroll context.
  afterTail?: ReactNode;
  // Collapses the lower rows to `collapsedKeys` behind a Show more / Show less
  // toggle. Undefined -> every lower row shows and no toggle renders.
  more?: {
    collapsedKeys: readonly string[];
    expanded: boolean;
    onToggle: () => void;
    showLabel: string;
    hideLabel: string;
  };
}

// Per-row status dot - same logic for sortable & locked rows. Suppressed on
// a row carrying offTooltip: lighting/cooling status polling deliberately
// keeps running while a feature is disabled (so re-enable can restore it),
// and the off-badge is the only indicator that row should show.
function rowStatus(item: NavItem, state: ServiceState): { show: boolean; pulsing: boolean } {
  if (item.offTooltip) return { show: false, pulsing: false };
  const key = item.key;
  const coolActive = key === 'cooling'
    && ((state.cooling?.activeCurveFanCount ?? 0) + (state.cooling?.manualFans ?? 0)) > 0;
  const coolCalibrating = key === 'cooling' && state.cooling?.calibrating;
  const lightActive = key === 'lighting' && state.lighting?.running;
  const lightScanning = key === 'lighting' && state.lighting?.scanning;
  const show = Boolean(coolActive || coolCalibrating || lightActive || lightScanning);
  const pulsing = Boolean(coolCalibrating || lightScanning);
  return { show, pulsing };
}

interface RowProps {
  item: NavItem;
  active: boolean;
  compact: boolean;
  serviceState: ServiceState;
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  // Collapsed out of the lower list: the shell animates to zero height and
  // goes inert, leaving the tab order and the accessibility tree.
  hidden?: boolean;
}

// dnd-kit attachments: the node ref and transform go on the row's shell, the
// activator attributes and listeners on its button.
interface SortableAttachments {
  setNodeRef: (node: HTMLElement | null) => void;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: React.DOMAttributes<HTMLElement>;
  style: React.CSSProperties;
  isDragging: boolean;
}

function SidebarRow({
  item, active, compact, serviceState, onClick, onContextMenu, hidden = false, sortable,
}: RowProps & { sortable?: SortableAttachments }) {
  const { show, pulsing } = rowStatus(item, serviceState);
  const button = (
    <button
      ref={sortable?.setActivatorNodeRef}
      type="button"
      className={classNames(styles.item, {
        [styles.active]: active,
        [styles.itemCompact]: compact,
        [styles.itemDragging]: sortable?.isDragging,
      })}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-label={compact ? item.label : undefined}
      data-sidebar-row-key={item.key}
      {...sortable?.attributes}
      {...sortable?.listeners}
    >
      <span className={styles.icon}>
        {item.icon}
        {show && (
          <span className={classNames(styles.statusIndicator, { [styles.statusPulsing]: pulsing })} />
        )}
      </span>
      {!compact && <span className={styles.label}>{item.label}</span>}
      {!compact && item.offTooltip && <NexusControlOffIcon label={item.offTooltip} />}
    </button>
  );
  return (
    <div
      ref={sortable?.setNodeRef}
      className={classNames(styles.rowShell, { [styles.rowShellHidden]: hidden })}
      style={sortable?.style}
      inert={hidden}
    >
      <div className={styles.rowShellInner}>
        {compact ? <HoverTooltip body={item.label} side="right">{button}</HoverTooltip> : button}
      </div>
    </div>
  );
}

// Must match .tailScroll's --tail-gap.
const TAIL_GAP_PX = 2;

// verticalListSortingStrategy derives each shifted item's travel from its own
// rect gap to its neighbor, so a row next to the separator block or to a
// collapsed row would travel a different distance from its siblings. One
// uniform stride - the dragged row's slot - moves every shifted row, and the
// separator itself, by exactly one slot.
const uniformVerticalStrategy: SortingStrategy = ({ activeIndex, activeNodeRect, index, rects, overIndex }) => {
  const activeRect = rects[activeIndex] ?? activeNodeRect;
  if (!activeRect) return null;
  const stride = activeRect.height + TAIL_GAP_PX;
  if (index === activeIndex) {
    const overRect = rects[overIndex];
    if (!overRect) return null;
    return { x: 0, y: overRect.top - activeRect.top, scaleX: 1, scaleY: 1 };
  }
  if (index > activeIndex && index <= overIndex) return { x: 0, y: -stride, scaleX: 1, scaleY: 1 };
  if (index < activeIndex && index >= overIndex) return { x: 0, y: stride, scaleX: 1, scaleY: 1 };
  return null;
};

function SortableRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.item.key, disabled: props.hidden });
  const style: React.CSSProperties = {
    // Translate only: dnd-kit scales the dragged row to the rect it hovers, and
    // over the one-pixel separator that flattens the row out of sight.
    transform: CSS.Translate.toString(transform),
    transition,
    // Render in-place instead of cloning into a DragOverlay - every row
    // shares one parent, so the dragged row never remounts and the cursor
    // stays anchored to the row the user grabbed.
    zIndex: isDragging ? 1 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };
  return (
    <SidebarRow
      {...props}
      sortable={{
        setNodeRef,
        setActivatorNodeRef,
        attributes,
        listeners: listeners ?? {},
        style,
        isDragging,
      }}
    />
  );
}

// The separator rides in the sortable list as an undraggable item: a row
// dropped on it crosses into the slot beside it - the first lower slot from
// above, the last pinned slot from below.
const SEPARATOR_ID = '__sidebar-separator__';

function SortableSeparator() {
  const { setNodeRef, transform, transition } =
    useSortable({ id: SEPARATOR_ID, disabled: { draggable: true, droppable: false } });
  return (
    <div
      ref={setNodeRef}
      className={styles.runningSeparator}
      data-sidebar-running-separator="true"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-hidden="true"
    />
  );
}

export function Sidebar({
  items, active, onChange, sectionLabel, sectionIcon, onSectionLabelClick, sectionLabelActive,
  serviceState,
  headerSlot, compact = false,
  extraItems, extraSectionLabel, extraActive, extraOnChange,
  onArrange, onItemContextMenu,
  lowerItems,
  afterTail,
  more,
}: SidebarProps) {
  const tail = items;
  const lower = lowerItems ?? [];
  const sortable = Boolean(onArrange);
  const tailKeys = tail.map(i => i.key);
  const lowerKeys = lower.map(i => i.key);
  const sortableKeys = lowerKeys.length > 0 ? [...tailKeys, SEPARATOR_ID, ...lowerKeys] : tailKeys;
  const isHidden = (key: string) => Boolean(more && !more.expanded && !more.collapsedKeys.includes(key));
  const hasHidden = Boolean(more && lowerKeys.some(key => !more.collapsedKeys.includes(key)));

  // PointerSensor with a 5px activation distance lets a plain click fire
  // navigation; the user has to actually drag to start a sort. KeyboardSensor
  // is wired so screen-reader users can reorder via the standard
  // SortableKeyboardCoordinates protocol (space to grab, arrows to move).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // One list across the fold: the separator's slot after the move is where it
  // splits back into pinned and lower. Collapsed rows keep their slots.
  const handleDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    if (!over || !onArrange) return;
    const from = sortableKeys.indexOf(String(dragged.id));
    const to = sortableKeys.indexOf(String(over.id));
    if (from < 0 || to < 0 || from === to) return;
    const next = arrayMove(sortableKeys, from, to);
    const sep = next.indexOf(SEPARATOR_ID);
    onArrange(sep < 0
      ? { pinned: next, lower: [] }
      : { pinned: next.slice(0, sep), lower: next.slice(sep + 1) });
  };

  const rowProps = (item: NavItem, hidden = false): RowProps => ({
    item,
    active: item.key === active,
    compact,
    serviceState,
    hidden,
    onClick: () => onChange(item.key),
    onContextMenu: onItemContextMenu ? (e) => {
      e.preventDefault();
      onItemContextMenu(item.key, e);
    } : undefined,
  });

  // Sits under the lower rows, so opening them slides the toggle down.
  const renderToggle = () => {
    if (!more || !hasHidden) return null;
    const label = more.expanded ? more.hideLabel : more.showLabel;
    const toggle = (
      <button
        type="button"
        className={classNames(styles.moreToggle, { [styles.moreToggleLabeled]: !compact })}
        onClick={more.onToggle}
        aria-expanded={more.expanded}
        aria-label={compact ? label : undefined}
      >
        <span className={styles.moreToggleGlyph}>
          <ChevronDown
            size={14}
            aria-hidden
            className={classNames(styles.moreChevron, { [styles.moreChevronUp]: more.expanded })}
          />
        </span>
        {!compact && <span className={styles.moreToggleLabel}>{label}</span>}
      </button>
    );
    return compact ? <HoverTooltip body={label} side="right">{toggle}</HoverTooltip> : toggle;
  };

  const renderExtra = () => {
    if (!extraItems || extraItems.length === 0) return null;
    return (
      <div className={styles.extraGroup}>
        {!compact && extraSectionLabel && (
          <div className={classNames(styles.sectionLabel, styles.extraSectionLabel)}>
            {extraSectionLabel}
          </div>
        )}
        {extraItems.map((item) => {
          if (item.href) {
            const link = (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={classNames(styles.item, { [styles.itemCompact]: compact })}
                aria-label={compact ? item.label : undefined}
              >
                <span className={styles.icon}>{item.icon}</span>
                {!compact && <span className={styles.label}>{item.label}</span>}
                {!compact && <ExternalLink size={12} className={styles.externalIcon} />}
              </a>
            );
            return compact ? (
              <HoverTooltip key={item.key} body={item.label} side="right">{link}</HoverTooltip>
            ) : link;
          }
          const isActive = item.key === extraActive;
          const button = (
            <button
              key={item.key}
              type="button"
              className={classNames(styles.item, {
                [styles.active]: isActive,
                [styles.itemCompact]: compact,
              })}
              onClick={() => extraOnChange?.(item.key)}
              aria-label={compact ? item.label : undefined}
            >
              <span className={styles.icon}>{item.icon}</span>
              {!compact && <span className={styles.label}>{item.label}</span>}
            </button>
          );
          return compact ? (
            <HoverTooltip key={item.key} body={item.label} side="right">{button}</HoverTooltip>
          ) : button;
        })}
      </div>
    );
  };

  // The section header (APPS / DEVICES landing) reuses the nav row chrome -
  // full-width button with the same hover/active highlight as every other row.
  // A small faint .headerChip around the icon + label marks it as a heading
  // without replacing that highlight. Compact collapses to the icon with a
  // tooltip, exactly like the nav rows.
  const renderSectionHeader = () => {
    if (!sectionLabel) return null;
    if (!onSectionLabelClick) {
      return !compact ? <div className={styles.sectionLabel}>{sectionLabel}</div> : null;
    }
    const btn = (
      <button
        type="button"
        className={classNames(styles.item, {
          [styles.active]: sectionLabelActive,
          [styles.itemCompact]: compact,
        })}
        onClick={onSectionLabelClick}
        aria-label={sectionLabel}
        aria-pressed={sectionLabelActive}
      >
        <span className={styles.headerChip}>
          <span className={styles.icon}>{sectionIcon}</span>
          {!compact && <span className={styles.label}>{sectionLabel}</span>}
        </span>
      </button>
    );
    return compact ? <HoverTooltip body={sectionLabel} side="right">{btn}</HoverTooltip> : btn;
  };

  return (
    <div className={classNames(styles.nav, { [styles.navCompact]: compact })}>
      {headerSlot && (
        <div className={classNames(styles.serviceHeader, { [styles.serviceHeaderCompact]: compact })}>
          {headerSlot}
        </div>
      )}
      {sortable ? (
        <div className={styles.tailScroll} data-sidebar-tail-scroll="true">
          {renderSectionHeader()}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableKeys} strategy={uniformVerticalStrategy}>
              {tail.map(item => <SortableRow key={item.key} {...rowProps(item)} />)}
              {lower.length > 0 && <SortableSeparator />}
              {lower.map(item => <SortableRow key={item.key} {...rowProps(item, isHidden(item.key))} />)}
            </SortableContext>
          </DndContext>
          {renderToggle()}
          {afterTail}
        </div>
      ) : (
        <div className={styles.tailScroll}>
          {renderSectionHeader()}
          {tail.map(item => <SidebarRow key={item.key} {...rowProps(item)} />)}
          {lower.length > 0 && <div className={styles.runningSeparator} aria-hidden="true" />}
          {lower.map(item => <SidebarRow key={item.key} {...rowProps(item, isHidden(item.key))} />)}
          {renderToggle()}
          {afterTail}
        </div>
      )}

      {renderExtra()}
    </div>
  );
}

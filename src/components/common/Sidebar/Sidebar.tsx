import { useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import classNames from 'classnames';
import {
  DndContext, type CollisionDetection, type DragEndEvent, type DragOverEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, type SortingStrategy, useSortable,
  sortableKeyboardCoordinates, arrayMove,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import type { ServiceState } from '../../../hooks/useServiceState';
import styles from './Sidebar.module.scss';

interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
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
  onSectionLabelClick?: () => void;
  sectionLabelActive?: boolean;
  serviceState: ServiceState;
  headerSlot?: ReactNode;
  compact?: boolean;
  extraItems?: readonly ExtraNavItem[];
  extraSectionLabel?: string;
  extraActive?: string;
  extraOnChange?: (key: string) => void;
  // Fires with the next ordering of `items` after a drag-reorder.
  // When omitted, items are non-sortable.
  onTailReorder?: (nextTailKeys: string[]) => void;
  // Optional context-menu hook fired by a right-click on an item row
  // (pinned tail rows AND the transient running row).
  onItemContextMenu?: (key: string, event: React.MouseEvent) => void;
  // Transient "running app" row (open page, not pinned). Rendered after the
  // tail behind a hairline separator, inside the same sortable context so it
  // can be dragged above the fold to pin it (macOS dock semantics).
  runningItem?: NavItem | null;
  // Fires when the running row is dropped inside the pinned tail; the index
  // is the tail slot it was dropped at.
  onRunningPinAt?: (index: number) => void;
  // Optional content rendered inside the scrollable region after the
  // items. Used by SidebarColumn to slot the DEVICES section below
  // APPS so both share one scroll context.
  afterTail?: ReactNode;
}

// Per-row status dot — same logic for sortable & locked rows.
function rowStatus(key: string, state: ServiceState): { show: boolean; pulsing: boolean } {
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
  // dnd-kit sortable attachments. Undefined for the locked head row.
  sortableProps?: {
    setNodeRef: (node: HTMLElement | null) => void;
    attributes: React.HTMLAttributes<HTMLElement>;
    listeners: React.DOMAttributes<HTMLElement>;
    style: React.CSSProperties;
    isDragging: boolean;
  };
}

function SidebarRow({ item, active, compact, serviceState, onClick, onContextMenu, sortableProps }: RowProps) {
  const { show, pulsing } = rowStatus(item.key, serviceState);
  const button = (
    <button
      ref={sortableProps?.setNodeRef}
      type="button"
      className={classNames(styles.item, {
        [styles.active]: active,
        [styles.itemCompact]: compact,
        [styles.itemDragging]: sortableProps?.isDragging,
      })}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-label={compact ? item.label : undefined}
      style={sortableProps?.style}
      data-sidebar-row-key={item.key}
      {...sortableProps?.attributes}
      {...sortableProps?.listeners}
    >
      <span className={styles.icon}>
        {item.icon}
        {show && (
          <span className={classNames(styles.statusIndicator, { [styles.statusPulsing]: pulsing })} />
        )}
      </span>
      {!compact && <span className={styles.label}>{item.label}</span>}
    </button>
  );
  return compact ? (
    <HoverTooltip body={item.label} side="right">{button}</HoverTooltip>
  ) : button;
}

// Standalone nav button reusing the exact item-row chrome (icon + label,
// hover/active highlight, compact tooltip). Used for one-off entries outside
// the sortable apps list — e.g. the bottom-pinned Settings button in the
// sidebar column — so they read identically to the nav rows above.
export function SidebarNavButton({ icon, label, active, compact, onClick }: {
  icon: ReactNode;
  label: string;
  active: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  const button = (
    <button
      type="button"
      className={classNames(styles.item, {
        [styles.active]: active,
        [styles.itemCompact]: compact,
      })}
      onClick={onClick}
      aria-label={compact ? label : undefined}
      aria-pressed={active}
    >
      <span className={styles.icon}>{icon}</span>
      {!compact && <span className={styles.label}>{label}</span>}
    </button>
  );
  return compact ? <HoverTooltip body={label} side="right">{button}</HoverTooltip> : button;
}

// Must match .tailScroll's flex gap.
const TAIL_GAP_PX = 2;

// verticalListSortingStrategy derives each shifted row's travel from its own
// rect gap to its neighbor, so the pinned row adjacent to the separator would
// travel further than its siblings (that gap includes the separator block).
// Same vertical list behavior, but with one uniform stride for every row.
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

function SortableRow(props: Omit<RowProps, 'sortableProps'>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.item.key });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Render in-place instead of cloning into a DragOverlay — the cursor
    // stays anchored to the row the user grabbed and the list is short
    // enough that a second tree mount is unnecessary.
    zIndex: isDragging ? 1 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  };
  return (
    <SidebarRow
      {...props}
      sortableProps={{
        setNodeRef,
        attributes,
        listeners: listeners ?? {},
        style,
        isDragging,
      }}
    />
  );
}

export function Sidebar({
  items, active, onChange, sectionLabel, onSectionLabelClick, sectionLabelActive,
  serviceState,
  headerSlot, compact = false,
  extraItems, extraSectionLabel, extraActive, extraOnChange,
  onTailReorder, onItemContextMenu,
  runningItem, onRunningPinAt,
  afterTail,
}: SidebarProps) {
  const tail = items;
  const sortable = Boolean(onTailReorder);
  const tailKeys = tail.map(i => i.key);
  // The running row sorts as the last item so dragging it above the fold
  // projects an insertion slot inside the tail.
  const sortableKeys = runningItem ? [...tailKeys, runningItem.key] : tailKeys;

  // PointerSensor with a 5px activation distance lets a plain click fire
  // navigation; the user has to actually drag to start a sort. KeyboardSensor
  // is wired so screen-reader users can reorder via the standard
  // SortableKeyboardCoordinates protocol (space to grab, arrows to move).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Pinned rows never target the running row's slot — only the running row
  // itself crosses the separator. Filtering the collision candidates (rather
  // than clamping after the fact) keeps the live preview honest too: the
  // running row is never shifted by a pinned drag.
  const collisionDetection: CollisionDetection = (args) => {
    const collisions = closestCenter(args);
    if (runningItem && String(args.active.id) !== runningItem.key) {
      return collisions.filter(c => String(c.id) !== runningItem.key);
    }
    return collisions;
  };

  // While the running row is projected into the tail, the separator slides
  // down one slot in step with the rows' uniform stride, so no pinned row
  // ever renders below the bar — only the running row crosses it.
  const [sepShift, setSepShift] = useState(0);
  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const overId = over ? String(over.id) : null;
    setSepShift(runningItem && String(active.id) === runningItem.key && overId && overId !== runningItem.key
      ? (active.rect.current.initial?.height ?? 0) + TAIL_GAP_PX
      : 0);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setSepShift(0);
    const activeKey = String(event.active.id);
    const overKey = event.over ? String(event.over.id) : null;
    if (!overKey || activeKey === overKey) return;
    const runningKey = runningItem?.key ?? null;
    // Running row dragged above the fold: pin it at the drop slot. Released
    // over itself / outside the tail it stays transient.
    if (activeKey === runningKey) {
      const to = tailKeys.indexOf(overKey);
      if (to >= 0) onRunningPinAt?.(to);
      return;
    }
    if (!onTailReorder) return;
    const from = tailKeys.indexOf(activeKey);
    // Pointer drags can't reach the running row (collision filter above), but
    // keyboard sorting can: clamp a pinned row dropped onto it to the end of
    // the pinned list — the running row is a boundary, not a slot.
    const to = overKey === runningKey ? tailKeys.length - 1 : tailKeys.indexOf(overKey);
    if (from < 0 || to < 0) return;
    const next = arrayMove(tailKeys, from, to);
    onTailReorder(next);
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

  return (
    <div className={classNames(styles.nav, { [styles.navCompact]: compact })}>
      {headerSlot && (
        <div className={classNames(styles.serviceHeader, { [styles.serviceHeaderCompact]: compact })}>
          {headerSlot}
        </div>
      )}
      {sectionLabel && (
        onSectionLabelClick ? (
          <button
            type="button"
            className={classNames(styles.sectionHeader, {
              [styles.sectionHeaderCompactRow]: compact,
              [styles.sectionHeaderActive]: sectionLabelActive,
            })}
            onClick={onSectionLabelClick}
            aria-label={sectionLabel}
          >
            {/* Compact mode shows the localized first letter ("A" for APPS
                in English, "Α" in Greek, "应" in Chinese); expanded shows the
                full uppercase label. The underline pseudo-element below the
                row marks it as a section heading, not a device row. */}
            <span className={styles.sectionHeaderLabel}>
              {compact ? Array.from(sectionLabel)[0]?.toLocaleUpperCase() ?? '' : sectionLabel}
            </span>
          </button>
        ) : (
          // Non-interactive header — collapses out in compact mode (nothing
          // to tap). Fallback; every consumer currently passes
          // onSectionLabelClick.
          !compact && <div className={styles.sectionLabel}>{sectionLabel}</div>
        )
      )}

      {sortable ? (
        <div className={styles.tailScroll} data-sidebar-tail-scroll="true">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setSepShift(0)}
          >
            <SortableContext items={sortableKeys} strategy={uniformVerticalStrategy}>
              {tail.map((item) => (
                <SortableRow
                  key={item.key}
                  item={item}
                  active={item.key === active}
                  compact={compact}
                  serviceState={serviceState}
                  onClick={() => onChange(item.key)}
                  onContextMenu={onItemContextMenu ? (e) => {
                    e.preventDefault();
                    onItemContextMenu(item.key, e);
                  } : undefined}
                />
              ))}
              {runningItem && (
                <>
                  <div
                    className={styles.runningSeparator}
                    data-sidebar-running-separator="true"
                    style={{
                      transform: sepShift ? `translateY(${sepShift}px)` : undefined,
                      transition: 'transform 200ms ease',
                    }}
                    aria-hidden="true"
                  />
                  <SortableRow
                    key={runningItem.key}
                    item={runningItem}
                    active={runningItem.key === active}
                    compact={compact}
                    serviceState={serviceState}
                    onClick={() => onChange(runningItem.key)}
                    onContextMenu={onItemContextMenu ? (e) => {
                      e.preventDefault();
                      onItemContextMenu(runningItem.key, e);
                    } : undefined}
                  />
                </>
              )}
            </SortableContext>
          </DndContext>
          {afterTail}
        </div>
      ) : (
        <div className={styles.tailScroll}>
          {tail.map((item) => (
            <SidebarRow
              key={item.key}
              item={item}
              active={item.key === active}
              compact={compact}
              serviceState={serviceState}
              onClick={() => onChange(item.key)}
              onContextMenu={onItemContextMenu ? (e) => {
                e.preventDefault();
                onItemContextMenu(item.key, e);
              } : undefined}
            />
          ))}
          {runningItem && (
            <>
              <div className={styles.runningSeparator} aria-hidden="true" />
              <SidebarRow
                key={runningItem.key}
                item={runningItem}
                active={runningItem.key === active}
                compact={compact}
                serviceState={serviceState}
                onClick={() => onChange(runningItem.key)}
                onContextMenu={onItemContextMenu ? (e) => {
                  e.preventDefault();
                  onItemContextMenu(runningItem.key, e);
                } : undefined}
              />
            </>
          )}
          {afterTail}
        </div>
      )}

      {renderExtra()}
    </div>
  );
}

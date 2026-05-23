import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import classNames from 'classnames';
import {
  DndContext, type DragEndEvent, PointerSensor, KeyboardSensor,
  useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
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
  // `onSectionLabelClick` is also provided the header is a button —
  // active state surfaces the same accent treatment a selected item
  // gets, so the header reads as a first-class destination (today:
  // APPS = the dashboard landing).
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
  // Optional context-menu hook fired by a right-click on an item row.
  onItemContextMenu?: (key: string, event: React.MouseEvent) => void;
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
  afterTail,
}: SidebarProps) {
  const tail = items;
  const sortable = Boolean(onTailReorder);
  const tailKeys = tail.map(i => i.key);

  // PointerSensor with a 5px activation distance lets a plain click fire
  // navigation; the user has to actually drag to start a sort. KeyboardSensor
  // is wired so screen-reader users can reorder via the standard
  // SortableKeyboardCoordinates protocol (space to grab, arrows to move).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!onTailReorder) return;
    const activeKey = String(event.active.id);
    const overKey = event.over ? String(event.over.id) : null;
    if (!overKey || activeKey === overKey) return;
    const from = tailKeys.indexOf(activeKey);
    const to = tailKeys.indexOf(overKey);
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
            {/* Compact mode shows just the localized first letter —
                "A" for APPS in English, "Α" in Greek, "应" in Chinese,
                etc. The expanded mode shows the full uppercase label.
                Either way the underline pseudo-element below the row
                visually anchors the section so the header reads as a
                heading rather than another tappable device row. */}
            <span className={styles.sectionHeaderLabel}>
              {compact ? Array.from(sectionLabel)[0]?.toLocaleUpperCase() ?? '' : sectionLabel}
            </span>
          </button>
        ) : (
          // Non-interactive header — collapses out in compact mode (no
          // affordance to tap, so no need to reserve the row). Today
          // every consumer passes onSectionLabelClick, but keep the
          // fallback for completeness.
          !compact && <div className={styles.sectionLabel}>{sectionLabel}</div>
        )
      )}

      {sortable ? (
        <div className={styles.tailScroll} data-sidebar-tail-scroll="true">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tailKeys} strategy={verticalListSortingStrategy}>
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
          {afterTail}
        </div>
      )}

      {renderExtra()}
    </div>
  );
}

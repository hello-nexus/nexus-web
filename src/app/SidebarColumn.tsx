import { useEffect, useRef, useState, type ReactNode } from 'react';
import classNames from 'classnames';
import { LayoutGrid, Pin, PinOff } from 'lucide-react';
import { Sidebar } from '../components/common/Sidebar/Sidebar';
import { useUiSettings } from '../hooks/useUiSettings';
import type { ServiceState } from '../hooks/useServiceState';
import { useTranslation } from '../lib/i18n';
import {
  SidebarBrand,
  SidebarConflictSlot,
  SidebarUpdateSlot,
} from './sidebar';
import { PairPhoneButton } from './PairPhoneModal';
import { SidebarContextMenu } from './SidebarContextMenu';
import { SidebarDevicesSection } from './SidebarDevicesSection';
import { ICON_SIZE } from './sidebarNav';
import {
  DASHBOARD_APP_KEY,
  getSidebarAppMeta,
  isPinnableAppKey,
  sanitizePinnedTail,
} from './sidebarApps';
import { useCrossZoneDrag } from './CrossZoneDrag';
import styles from '../App.module.scss';

interface ExtraNavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly href?: string;
}

interface SidebarColumnProps {
  compact: boolean;
  online: boolean;
  serviceState: ServiceState;
  serviceNavActive: string;
  onServiceNavChange: (key: string) => void;
  // Empty in service builds today; rendered as the secondary section
  // (External-link entries like Builder/Benchmark/Community).
  portalNav: readonly ExtraNavItem[];
  portalNavActive: string;
  onPortalNavChange: (key: string) => void;
  remoteControlEnabled: boolean;
  phoneSubscribers: number;
  onPairPhoneOpen: () => void;
  onUpdateOpen: () => void;
  onInstall: () => void;
  // Device-page routing - surfaced from Dashboard so the sidebar's
  // DEVICES section can both highlight the active device and navigate
  // into a fresh device page on click.
  activeDeviceKey: string;
  onDeviceSelect: (deviceKey: string) => void;
  // Click on the DEVICES section header routes here - the all-devices
  // landing page. Dashboard maps this to the existing DevicesPage.
  onDevicesHeaderClick: () => void;
  devicesHeaderActive: boolean;
}

export function SidebarColumn({
  compact,
  online,
  serviceState,
  serviceNavActive,
  onServiceNavChange,
  portalNav,
  portalNavActive,
  onPortalNavChange,
  remoteControlEnabled,
  phoneSubscribers,
  onPairPhoneOpen,
  onUpdateOpen,
  onInstall,
  activeDeviceKey,
  onDeviceSelect,
  onDevicesHeaderClick,
  devicesHeaderActive,
}: SidebarColumnProps) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();

  // The APPS section header IS the Dashboard entry; there's no separate
  // "Dashboard" row. The pinned-apps list below is the user-ordered tail.
  // sanitizePinnedTail() drops unknown / duplicate server keys so a stale
  // or hand-edited prefs blob can't render gaps.
  const tail = sanitizePinnedTail(settings.pinnedSidebarApps);
  const items = tail.flatMap(key => {
    const meta = getSidebarAppMeta(key);
    if (!meta) return [];
    return [{ key, label: t(meta.i18nKey), icon: meta.icon }];
  });

  // Persist a reorder by writing the new tail back. The sanitizer in
  // useUiSettings drops any non-pinnable keys so a bad nextTail can never
  // poison settings.
  const handleTailReorder = (nextTailKeys: string[]) => {
    update({ pinnedSidebarApps: nextTailKeys });
  };

  // Right-click context menu state. Held here so the menu portal dismisses
  // on outside click without each row tracking its own open state. `pinned`
  // picks the menu: a pinned row offers Unpin, the running row offers Pin.
  const [ctxMenu, setCtxMenu] = useState<{ key: string; x: number; y: number; pinned: boolean } | null>(null);
  const handleItemContextMenu = (key: string, event: React.MouseEvent) => {
    setCtxMenu({ key, x: event.clientX, y: event.clientY, pinned: tail.includes(key) });
  };
  const handleUnpin = (key: string) => {
    update({ pinnedSidebarApps: tail.filter(k => k !== key) });
  };
  const handlePin = (key: string) => {
    if (!isPinnableAppKey(key) || tail.includes(key)) return;
    update({ pinnedSidebarApps: [...tail, key] });
  };

  // Taskbar semantics for unpinned apps: while an unpinned app's page is
  // open, it surfaces as a transient row below the pinned tail (behind a
  // hairline separator). It unmounts when the user navigates off the page;
  // right-click → Pin makes it a permanent tail row.
  const runningUnpinned = (() => {
    if (!isPinnableAppKey(serviceNavActive) || tail.includes(serviceNavActive)) return null;
    const meta = getSidebarAppMeta(serviceNavActive);
    if (!meta) return null;
    return { key: serviceNavActive, label: t(meta.i18nKey), icon: meta.icon };
  })();
  // Drop-pin from dragging the running row above the fold: insert at the
  // slot it was dropped on.
  const handleRunningPinAt = (index: number) => {
    if (!runningUnpinned || tail.includes(runningUnpinned.key)) return;
    const next = [...tail];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, runningUnpinned.key);
    update({ pinnedSidebarApps: next });
  };


  // Cross-zone drop from the dashboard panel. Published by PanelContent
  // when a pinnable widget enters its drag state; null otherwise.
  const { draggingPinnableType } = useCrossZoneDrag();
  const handlePinDrop = (insertionIndex: number) => {
    if (!draggingPinnableType || !isPinnableAppKey(draggingPinnableType)) return;
    if (tail.includes(draggingPinnableType)) return;
    const next = [...tail];
    const idx = Math.max(0, Math.min(insertionIndex, next.length));
    next.splice(idx, 0, draggingPinnableType);
    update({ pinnedSidebarApps: next });
  };

  return (
    <div className={classNames(styles.sidebarColumn, { [styles.sidebarCompact]: compact })}>
      <SidebarBrand
        compact={compact}
        onLogoClick={() => onServiceNavChange(DASHBOARD_APP_KEY)}
        logoLabel={t('sidebar.section.apps')}
      />
      <Sidebar
        items={items}
        active={serviceNavActive}
        onChange={onServiceNavChange}
        sectionLabel={t('sidebar.section.apps')}
        sectionIcon={<LayoutGrid size={ICON_SIZE} />}
        onSectionLabelClick={() => onServiceNavChange(DASHBOARD_APP_KEY)}
        sectionLabelActive={serviceNavActive === DASHBOARD_APP_KEY}
        serviceState={serviceState}
        onTailReorder={handleTailReorder}
        onItemContextMenu={handleItemContextMenu}
        runningItem={runningUnpinned}
        onRunningPinAt={handleRunningPinAt}
        compact={compact}
        extraItems={portalNav}
        extraSectionLabel=""
        extraActive={portalNavActive}
        extraOnChange={onPortalNavChange}
        afterTail={
          <SidebarDevicesSection
            serviceOnline={online}
            activeDeviceKey={activeDeviceKey}
            compact={compact}
            onSelect={onDeviceSelect}
            onHeaderClick={onDevicesHeaderClick}
            headerActive={devicesHeaderActive}
          />
        }
      />
      <PairPhoneButton
        connectedCount={phoneSubscribers}
        remoteEnabled={remoteControlEnabled}
        disabled={!online}
        compact={compact}
        onClick={onPairPhoneOpen}
      />
      <SidebarConflictSlot serviceOnline={online} compact={compact} />
      <SidebarUpdateSlot serviceOnline={online} compact={compact} onOpen={onUpdateOpen} onInstall={onInstall} />
      {ctxMenu && (
        <SidebarContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.pinned ? [
            {
              // eslint-disable-next-line i18next/no-literal-string -- menu item id
              key: 'unpin',
              label: t('sidebar.unpin'),
              icon: <PinOff size={14} />,
              danger: true,
              onSelect: () => handleUnpin(ctxMenu.key),
            },
          ] : [
            {
              // eslint-disable-next-line i18next/no-literal-string -- menu item id
              key: 'pin',
              label: t('sidebar.pin'),
              icon: <Pin size={14} />,
              onSelect: () => handlePin(ctxMenu.key),
            },
          ]}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {draggingPinnableType && (
        <SidebarPinDropTarget onDrop={handlePinDrop} />
      )}
    </div>
  );
}

interface SidebarPinDropTargetProps {
  onDrop: (insertionIndex: number) => void;
}

// Listens to the panel widget drag via document-level pointer events
// while it's in flight (mounted only when CrossZoneDragContext publishes
// a draggingPinnableType). Computes an insertion index from the cursor
// position relative to the sidebar's tail-scroll region, renders an
// insertion line at the corresponding viewport y, and pins the widget
// on pointerup when the drop landed inside the tail. The panel's own
// onDragEnd handles clearing its drag state - this overlay only acts on
// the sidebar side.
function SidebarPinDropTarget({ onDrop }: SidebarPinDropTargetProps) {
  // `position` in fixed (viewport) coordinates so the indicator can render
  // anywhere the cursor lands inside the tail without nesting inside Sidebar.
  // Null (indicator hidden) when the cursor is outside the tail rect.
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const insertionIndexRef = useRef<number | null>(null);
  const onDropRef = useRef(onDrop);
  useEffect(() => { onDropRef.current = onDrop; }, [onDrop]);

  // The panel's onDragEnd invokes this ref BEFORE clearing the drag
  // state, so we can pin even when React 19 flushes the unmount
  // synchronously inside dnd-kit's drag-end handler (which detaches our
  // pointerup listener before the native event reaches it).
  const { dropHandlerRef } = useCrossZoneDrag();

  useEffect(() => {
    const tailEl = document.querySelector<HTMLElement>('[data-sidebar-tail-scroll]');
    if (!tailEl) return;

    // Snapshot row rects once per drag. The tail isn't reordered while
    // a panel drag is in flight, so the rects stay valid; this avoids a
    // querySelectorAll on every pointermove.
    const rowEls = Array.from(tailEl.querySelectorAll<HTMLElement>('[data-sidebar-row-key]'));
    const rects = rowEls.map(el => el.getBoundingClientRect());
    const tailRect = tailEl.getBoundingClientRect();

    const handleMove = (e: PointerEvent) => {
      const inside = e.clientX >= tailRect.left
        && e.clientX <= tailRect.right
        && e.clientY >= tailRect.top
        && e.clientY <= tailRect.bottom;
      if (!inside) {
        insertionIndexRef.current = null;
        setPosition(null);
        return;
      }
      // Walk row rects: insertion index = count of rows whose midpoint
      // sits above the cursor. The indicator y snaps to the boundary
      // between the two rows the cursor falls between (or to the top /
      // bottom of the tail when at an edge).
      let idx = 0;
      let lineY = tailRect.top;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const mid = r.top + r.height / 2;
        if (e.clientY < mid) {
          lineY = r.top - 1;
          break;
        }
        idx = i + 1;
        lineY = r.bottom + 1;
      }
      insertionIndexRef.current = idx;
      setPosition({
        top: lineY,
        left: tailRect.left + 8,
        width: tailRect.width - 16,
      });
    };

    // Synchronous drop committer the panel invokes from its onDragEnd before
    // drag-state cleanup unmounts us. Reads the latest pointermove insertion
    // index.
    dropHandlerRef.current = () => {
      const idx = insertionIndexRef.current;
      if (idx !== null) onDropRef.current(idx);
    };

    document.addEventListener('pointermove', handleMove);
    return () => {
      dropHandlerRef.current = null;
      document.removeEventListener('pointermove', handleMove);
    };
  }, [dropHandlerRef]);

  if (!position) return null;
  return (
    <div
      className={styles.sidebarPinIndicator}
      style={{ top: position.top, left: position.left, width: position.width }}
      aria-hidden="true"
    />
  );
}

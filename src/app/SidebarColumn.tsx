import { useEffect, useRef, useState, type ReactNode } from 'react';
import classNames from 'classnames';
import { LayoutGrid, Pin, PinOff, X } from 'lucide-react';
import { Sidebar } from '../components/common/Sidebar/Sidebar';
import { useUiSettings, type UiSettingsValue } from '../hooks/useUiSettings';
import type { ServiceState } from '../hooks/useServiceState';
import { useTranslation } from '../lib/i18n';
import { SidebarBrand } from './sidebar';
import { PairPhoneButton } from './PairPhoneModal';
import { SidebarContextMenu } from './SidebarContextMenu';
import { SidebarDevicesSection } from './SidebarDevicesSection';
import { ICON_SIZE } from './sidebarNav';
import {
  DASHBOARD_APP_KEY,
  appendRecent,
  getSidebarAppMeta,
  isPinnableAppKey,
  sanitizePinnedTail,
  sanitizeRecents,
} from './sidebarApps';
import { useCrossZoneDrag } from './CrossZoneDrag';
import styles from '../App.module.scss';

// The four feature-pillar sidebar rows share their key with FeatureKey
// (useUiSettings) verbatim - no separate lookup table needed.
function featureFlagOff(key: string, settings: UiSettingsValue): boolean {
  switch (key) {
    case 'monitoring': return !settings.featureMonitoringEnabled;
    case 'lighting': return !settings.featureLightingEnabled;
    case 'cooling': return !settings.featureCoolingEnabled;
    case 'diagnostics': return !settings.featureDiagnosticsEnabled;
    default: return false;
  }
}

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
  // (external-link entries like Benchmark).
  portalNav: readonly ExtraNavItem[];
  portalNavActive: string;
  onPortalNavChange: (key: string) => void;
  remoteControlEnabled: boolean;
  phoneSubscribers: number;
  onPairPhoneOpen: () => void;
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
  const offTooltip = t('featureDisabled.sidebarTooltip');
  const items = tail.flatMap(key => {
    const meta = getSidebarAppMeta(key);
    if (!meta) return [];
    return [{ key, label: t(meta.i18nKey), icon: meta.icon, offTooltip: featureFlagOff(key, settings) ? offTooltip : undefined }];
  });

  // Persist a reorder by writing the new tail back. The sanitizer in
  // useUiSettings drops any non-pinnable keys so a bad nextTail can never
  // poison settings.
  const handleTailReorder = (nextTailKeys: string[]) => {
    update({ pinnedSidebarApps: nextTailKeys });
  };

  // Right-click context menu state. Held here so the menu portal dismisses
  // on outside click without each row tracking its own open state. `pinned`
  // picks the menu: a pinned row offers Unpin; a recent row offers Pin (plus
  // Remove, unless it's the currently-active view - see the menu render below).
  const [ctxMenu, setCtxMenu] = useState<{ key: string; x: number; y: number; pinned: boolean } | null>(null);
  const handleItemContextMenu = (key: string, event: React.MouseEvent) => {
    setCtxMenu({ key, x: event.clientX, y: event.clientY, pinned: tail.includes(key) });
  };
  const handleUnpin = (key: string) => {
    update({ pinnedSidebarApps: tail.filter(k => k !== key) });
  };
  // Pinning (menu, or the drag-up-to-pin gesture below) also strips the key
  // from recents - an app is never shown both above and below the separator.
  const handlePin = (key: string) => {
    if (!isPinnableAppKey(key) || tail.includes(key)) return;
    update({
      pinnedSidebarApps: [...tail, key],
      recentSidebarApps: sanitizeRecents(settings.recentSidebarApps).filter(k => k !== key),
    });
  };
  const handleRemoveRecent = (key: string) => {
    update({ recentSidebarApps: sanitizeRecents(settings.recentSidebarApps).filter(k => k !== key) });
  };

  // Taskbar / macOS-dock semantics: recently opened pinnable apps that
  // aren't pinned surface as rows below the pinned tail (behind a hairline
  // separator), stable FIFO order, oldest evicted first. Excludes anything
  // already pinned - handlePin/handleRunningPinAt/handlePinDrop strip the
  // recents entry the moment it's pinned, but this filter also guards a
  // stale/hand-edited prefs blob.
  const storedRecents = sanitizeRecents(settings.recentSidebarApps).filter(k => !tail.includes(k));
  // Render the just-opened app immediately, even a tick before the append
  // effect below persists it - otherwise navigating to a new unpinned app
  // flashes an empty slot for one render.
  const recents = isPinnableAppKey(serviceNavActive) && !tail.includes(serviceNavActive)
    ? appendRecent(storedRecents, serviceNavActive)
    : storedRecents;
  const recentItems = recents.flatMap(key => {
    const meta = getSidebarAppMeta(key);
    if (!meta) return [];
    return [{ key, label: t(meta.i18nKey), icon: meta.icon, offTooltip: featureFlagOff(key, settings) ? offTooltip : undefined }];
  });

  // Persists the FIFO append: stable order, no-op when the app is already in
  // the list (appendRecent enforces the cap). Depends on the raw settings
  // arrays - not `tail` / `recents` above, which are freshly allocated every
  // render and would refire this effect (and loop) on every render.
  useEffect(() => {
    if (!isPinnableAppKey(serviceNavActive)) return;
    if (sanitizePinnedTail(settings.pinnedSidebarApps).includes(serviceNavActive)) return;
    const recentsNow = sanitizeRecents(settings.recentSidebarApps);
    const next = appendRecent(recentsNow, serviceNavActive);
    if (next !== recentsNow) update({ recentSidebarApps: next });
  }, [serviceNavActive, settings.pinnedSidebarApps, settings.recentSidebarApps, update]);

  // Drop-pin from dragging a recent row above the fold: insert at the slot it
  // was dropped on and strip it from recents.
  const handleRunningPinAt = (key: string, index: number) => {
    if (!isPinnableAppKey(key) || tail.includes(key)) return;
    const next = [...tail];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, key);
    update({
      pinnedSidebarApps: next,
      recentSidebarApps: sanitizeRecents(settings.recentSidebarApps).filter(k => k !== key),
    });
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
    update({
      pinnedSidebarApps: next,
      recentSidebarApps: sanitizeRecents(settings.recentSidebarApps).filter(k => k !== draggingPinnableType),
    });
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
        runningItems={recentItems}
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
            // Remove only for a recent row that isn't the current view - the
            // active row always stays visible below the separator.
            ...(ctxMenu.key === serviceNavActive ? [] : [
              {
                // eslint-disable-next-line i18next/no-literal-string -- menu item id
                key: 'remove',
                label: t('sidebar.removeFromRecents'),
                icon: <X size={14} />,
                onSelect: () => handleRemoveRecent(ctxMenu.key),
              },
            ]),
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

import { useEffect, useRef, useState, type ReactNode } from 'react';
import classNames from 'classnames';
import { PinOff } from 'lucide-react';
import { Sidebar, SidebarNavButton } from '../components/common/Sidebar/Sidebar';
import { ProfileDropdown } from '../components/common/ProfileDropdown/ProfileDropdown';
import { NAV_ICONS } from './sidebarNav';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useUiSettings } from '../hooks/useUiSettings';
import type { ServiceState } from '../hooks/useServiceState';
import type { ConnectionState } from '../hooks/useServiceStatus';
import type { UseProfilesResult } from '../hooks/useProfiles';
import type { Preferences } from '../api/profiles';
import { useTranslation } from '../lib/i18n';
import {
  SidebarBrand,
  ConnectedProfileSlot,
  NotConnectedBadge,
  SidebarConflictSlot,
} from './sidebar';
import { PairPhoneButton } from './PairPhoneModal';
import { SidebarContextMenu } from './SidebarContextMenu';
import { SidebarDevicesSection } from './SidebarDevicesSection';
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
  onToggleCompact: () => void;
  online: boolean;
  connectionState: ConnectionState;
  connectEpoch: number;
  serviceState: ServiceState;
  serviceNavActive: string;
  onServiceNavChange: (key: string) => void;
  // Empty in service builds today; rendered as the secondary section
  // (External-link entries like Builder/Benchmark/Community).
  portalNav: readonly ExtraNavItem[];
  portalNavActive: string;
  onPortalNavChange: (key: string) => void;
  profiles: UseProfilesResult;
  onPreferencesChanged: (prefs: Preferences) => void;
  onNavigateSettings: () => void;
  settingsActive: boolean;
  remoteControlEnabled: boolean;
  phoneSubscribers: number;
  onPairPhoneOpen: () => void;
  // Device-page routing — surfaced from Dashboard so the sidebar's
  // DEVICES section can both highlight the active device and navigate
  // into a fresh device page on click.
  activeDeviceKey: string;
  onDeviceSelect: (deviceKey: string) => void;
  // Click on the DEVICES section header routes here — the all-devices
  // landing page. Dashboard maps this to the existing DevicesPage.
  onDevicesHeaderClick: () => void;
  devicesHeaderActive: boolean;
}

export function SidebarColumn({
  compact,
  onToggleCompact,
  online,
  connectionState,
  connectEpoch,
  serviceState,
  serviceNavActive,
  onServiceNavChange,
  portalNav,
  portalNavActive,
  onPortalNavChange,
  profiles,
  onPreferencesChanged,
  onNavigateSettings,
  settingsActive,
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

  // The sidebar's APPS section header IS the Dashboard entry — there's
  // no separate "Dashboard" row anymore. The pinned-apps list below
  // the header is just the user-ordered tail. sanitizePinnedTail()
  // drops unknown / duplicate keys read from the server, so a stale or
  // hand-edited preferences blob can't render gaps.
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

  // Right-click context menu state. Held here so the menu portal can
  // dismiss cleanly on outside click without each row tracking its own
  // open state.
  const [ctxMenu, setCtxMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const handleItemContextMenu = (key: string, event: React.MouseEvent) => {
    setCtxMenu({ key, x: event.clientX, y: event.clientY });
  };
  const handleUnpin = (key: string) => {
    update({ pinnedSidebarApps: tail.filter(k => k !== key) });
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
        onToggleCompact={onToggleCompact}
        logoLabel={t('sidebar.section.apps')}
        collapseLabel={t('sidebar.collapse')}
      />
      <Sidebar
        items={items}
        active={serviceNavActive}
        onChange={onServiceNavChange}
        sectionLabel={t('sidebar.section.apps')}
        onSectionLabelClick={() => onServiceNavChange(DASHBOARD_APP_KEY)}
        sectionLabelActive={serviceNavActive === DASHBOARD_APP_KEY}
        serviceState={serviceState}
        onTailReorder={handleTailReorder}
        onItemContextMenu={handleItemContextMenu}
        headerSlot={
          <div className={classNames(styles.sidebarHeaderBox, { [styles.sidebarHeaderBoxCompact]: compact })}>
            {online ? (
              <ConnectedProfileSlot connectEpoch={connectEpoch}>
                <ProfileDropdown
                  profiles={profiles}
                  onPreferencesChanged={onPreferencesChanged}
                  onNavigateSettings={onNavigateSettings}
                  compact={compact}
                />
              </ConnectedProfileSlot>
            ) : (
              <NotConnectedBadge state={connectionState} t={t} compact={compact} />
            )}
          </div>
        }
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
      <div className={styles.sidebarSettingsItem}>
        <SidebarNavButton
          icon={NAV_ICONS.settings}
          label={t('nav.settings')}
          active={settingsActive}
          compact={compact}
          onClick={onNavigateSettings}
        />
      </div>
      <SidebarConflictSlot serviceOnline={online} compact={compact} />
      <HoverTooltip body={compact ? t('sidebar.expand') : t('sidebar.collapse')} side="right">
        <button
          type="button"
          className={styles.collapseEdge}
          onClick={onToggleCompact}
          aria-label={compact ? t('sidebar.expand') : t('sidebar.collapse')}
        />
      </HoverTooltip>
      {ctxMenu && (
        <SidebarContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            {
              key: 'unpin',
              label: t('sidebar.unpin'),
              icon: <PinOff size={14} />,
              danger: true,
              onSelect: () => handleUnpin(ctxMenu.key),
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
// onDragEnd handles clearing its drag state — this overlay only acts on
// the sidebar side.
function SidebarPinDropTarget({ onDrop }: SidebarPinDropTargetProps) {
  // `position` lives at fixed (viewport) coordinates so we can render the
  // indicator anywhere the cursor lands inside the tail without nesting
  // inside the Sidebar component itself. Null when the cursor is outside
  // the tail rect; the indicator hides in that case.
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

    // Register a synchronous drop committer the panel will invoke from
    // its onDragEnd, BEFORE the drag-state cleanup unmounts us. Reads
    // the latest insertion index that pointermove has been updating.
    // The native pointerup listener path is unreliable under React 19 —
    // setDraggingPinnableType(null) inside dnd-kit's onDragEnd flushes
    // synchronously, unmounting this component and detaching its
    // pointerup listener before the native event reaches it.
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

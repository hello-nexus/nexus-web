import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import classNames from 'classnames';
import { LayoutGrid, Pin, PinOff } from 'lucide-react';
import { Sidebar } from '../components/common/Sidebar/Sidebar';
import { useUiSettings, type UiSettingsValue } from '../hooks/useUiSettings';
import type { ServiceState } from '../hooks/useServiceState';
import { useSessionRecents } from '../hooks/useSessionRecents';
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
  listSidebarAppKeys,
  sanitizePinnedTail,
} from './sidebarApps';
import {
  isMarketplaceRegistryStale,
  loadMarketplaceApps,
  subscribeMarketplaceRegistry,
} from '../widgets/marketplaceRegistry';
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

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
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
  // Session-scoped, not a setting: a reopened window keeps the rows, a fresh
  // service start does not (see useSessionRecents).
  const { recents: storedRecentsRaw, loaded: recentsLoaded, setRecents } = useSessionRecents(online);

  // The APPS section header IS the Dashboard entry; there's no separate
  // "Dashboard" row. The pinned-apps list below is the user-ordered tail.
  // sanitizePinnedTail() drops unknown / duplicate server keys so a stale
  // or hand-edited prefs blob can't render gaps.
  const tail = sanitizePinnedTail(settings.pinnedSidebarApps);
  const offTooltip = t('featureDisabled.sidebarTooltip');
  const navItem = (key: string) => {
    const meta = getSidebarAppMeta(key);
    if (!meta) return [];
    return [{ key, label: t(meta.i18nKey), icon: meta.icon, offTooltip: featureFlagOff(key, settings) ? offTooltip : undefined }];
  };
  const items = tail.flatMap(navItem);

  // Right-click context menu state. Held here so the menu portal dismisses
  // on outside click without each row tracking its own open state. `pinned`
  // picks the menu: a pinned row offers Unpin; a lower row offers Pin.
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
    update({ pinnedSidebarApps: [...tail, key] });
    setRecents(storedRecentsRaw.filter(k => k !== key));
  };

  // The last unpinned app opened (appendRecent caps the list) is the lower row
  // shown while Show more is collapsed. Excludes anything already pinned -
  // pinning strips the recents entry, but this filter also guards a list
  // stored before the pin landed.
  const storedRecents = storedRecentsRaw.filter(k => !tail.includes(k));
  // Render the just-opened app immediately, even a tick before the append
  // effect below persists it - otherwise navigating to a new unpinned app
  // flashes an empty slot for one render.
  const recents = isPinnableAppKey(serviceNavActive) && !tail.includes(serviceNavActive)
    ? appendRecent(storedRecents, serviceNavActive)
    : storedRecents;

  // Persists the FIFO append: stable order, no-op when the app is already in
  // the list (appendRecent enforces the cap). Waits for the stored list, so
  // the page a window opens on is appended to it rather than over it. Depends
  // on the raw arrays - not `tail` / `recents` above, which are freshly
  // allocated every render and would refire this effect (and loop) on every
  // render.
  useEffect(() => {
    if (!recentsLoaded || !isPinnableAppKey(serviceNavActive)) return;
    if (sanitizePinnedTail(settings.pinnedSidebarApps).includes(serviceNavActive)) return;
    const next = appendRecent(storedRecentsRaw, serviceNavActive);
    if (next !== storedRecentsRaw) setRecents(next);
  }, [recentsLoaded, serviceNavActive, settings.pinnedSidebarApps, storedRecentsRaw, setRecents]);

  // Below the separator: every unpinned app, in the user's dragged order, then
  // the rest by name. Collapsed, only the recent row shows; opening an app
  // never moves it, so an expanded list keeps its order.
  const [moreOpen, setMoreOpen] = useState(false);
  // The marketplace registry is a module-level cache React can't observe;
  // subscribe while the list is open so an SDK app that finishes loading shows
  // up. Same pattern as PanelWidgetCatalog.
  const forceRender = useReducer((r: number) => r + 1, 0)[1];
  useEffect(() => {
    if (!moreOpen) return;
    if (isMarketplaceRegistryStale()) void loadMarketplaceApps();
    return subscribeMarketplaceRegistry(forceRender);
  }, [moreOpen, forceRender]);
  const order = settings.sidebarAppOrder;
  const unpinned = listSidebarAppKeys().filter(key => !tail.includes(key));
  // A recent app the catalog doesn't browse (delisted, opened from search).
  for (const key of recents) if (!unpinned.includes(key)) unpinned.push(key);
  const lowerItems = [
    ...order.filter(key => unpinned.includes(key)).flatMap(navItem),
    ...unpinned.filter(key => !order.includes(key)).flatMap(navItem).sort((a, b) => a.label.localeCompare(b.label)),
  ];

  // One drop reorders either side, docks a lower row (it leaves recents) or
  // undocks a pinned one at the drop slot. Collapsed, the undocked row becomes
  // the recent so it stays visible - unless the current page is itself
  // unpinned, which keeps the one collapsed slot.
  const handleArrange = ({ pinned, lower }: { pinned: string[]; lower: string[] }) => {
    const patch: { pinnedSidebarApps?: string[]; sidebarAppOrder?: string[] } = {};
    if (!sameOrder(pinned, tail)) patch.pinnedSidebarApps = pinned;
    // Docking only removes a key; the saved order changes when a row moves
    // within the lower list or lands in it. Saved keys not rendered right now
    // (registry still loading, app briefly uninstalled) keep a slot at the end.
    const lowerBefore = lowerItems.map(i => i.key).filter(k => lower.includes(k));
    if (!sameOrder(lower, lowerBefore)) {
      patch.sidebarAppOrder = [...lower, ...order.filter(k => !lower.includes(k) && !pinned.includes(k))];
    }
    if (patch.pinnedSidebarApps || patch.sidebarAppOrder) update(patch);
    const docked = pinned.find(k => !tail.includes(k));
    if (docked) setRecents(storedRecentsRaw.filter(k => k !== docked));
    const undocked = tail.find(k => !pinned.includes(k));
    if (undocked && !moreOpen) setRecents([undocked]);
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
    setRecents(storedRecentsRaw.filter(k => k !== draggingPinnableType));
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
        onArrange={handleArrange}
        onItemContextMenu={handleItemContextMenu}
        lowerItems={lowerItems}
        more={{
          collapsedKeys: recents,
          expanded: moreOpen,
          onToggle: () => setMoreOpen(open => !open),
          showLabel: t('sidebar.showMore'),
          hideLabel: t('sidebar.showLess'),
        }}
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
// position relative to the pinned rows, renders an insertion line at the
// corresponding viewport y, and pins the widget on pointerup when the drop
// landed above the separator. The panel's own
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
    // querySelectorAll on every pointermove. Only pinned rows count - the
    // zone ends at the separator, so a drop is a pin exactly when it lands
    // where the pinned slots are.
    const tailRect = tailEl.getBoundingClientRect();
    const separator = tailEl.querySelector<HTMLElement>('[data-sidebar-running-separator]');
    const zoneBottom = Math.min(separator ? separator.getBoundingClientRect().top : tailRect.bottom, tailRect.bottom);
    const rects = Array.from(tailEl.querySelectorAll<HTMLElement>('[data-sidebar-row-key]'))
      .map(el => el.getBoundingClientRect())
      .filter(r => r.top < zoneBottom);

    const handleMove = (e: PointerEvent) => {
      const inside = e.clientX >= tailRect.left
        && e.clientX <= tailRect.right
        && e.clientY >= tailRect.top
        && e.clientY <= zoneBottom;
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
    // index; true tells the panel the drop was a pin, not a move.
    dropHandlerRef.current = () => {
      const idx = insertionIndexRef.current;
      if (idx === null) return false;
      onDropRef.current(idx);
      return true;
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

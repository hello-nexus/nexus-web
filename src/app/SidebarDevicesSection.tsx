import { useCallback, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { Ghost, Link2, Trash2, Unlink, Usb } from 'lucide-react';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { DeviceWarningIcon } from '../components/common/DeviceWarningIcon/DeviceWarningIcon';
import { NexusControlOffIcon } from '../components/common/NexusControlOffIcon/NexusControlOffIcon';
import { useToastSafe } from '../components/common/Toast/Toast';
import { useUnifiedDevices, isSimulatedDevice, type UnifiedDevice } from '../hooks/useUnifiedDevices';
import { promoteDisplayToPanel, demoteDisplayPanel } from '../api/displays';
import { clearSimulatedStreamDeck } from '../api/streamdeck';
import { DEV_TOOLS } from '../lib/devTools';
import { setSimulatedPanelConnected } from '../lib/panelSimulation';
import { setTryxSimulated } from '../lib/tryxSimulation';
import { useTranslation } from '../lib/i18n';
import { SidebarContextMenu } from './SidebarContextMenu';
import { ICON_SIZE } from './sidebarNav';
import styles from './SidebarDevicesSection.module.scss';

/**
 * The DEVICES section of the sidebar. Lists every detected + supported
 * device (panels, curated hardware) the system knows
 * about, with a click navigating into that device's dedicated page.
 *
 * Wraps `useUnifiedDevices` - the same hook DevicesPage and the dashboard
 * Devices widget consume, so a click lands on the same device record.
 *
 * Empty state: a single hint row when no devices are connected. The header
 * always renders so the section structure is visible without devices.
 *
 * Right-clicking a row opens the shared SidebarContextMenu with the row's
 * Nexus Control toggle, plus (dev tools only) a remover for a simulated
 * device.
 */
interface SidebarDevicesSectionProps {
  serviceOnline: boolean;
  // Currently active device key (the `subtab` portion of the route
  // when view === 'device'). Empty string when no device page is open.
  activeDeviceKey: string;
  // Compact = sidebar collapsed; render icon-only rows with tooltips.
  compact: boolean;
  onSelect: (deviceKey: string) => void;
  // Click on the section header itself routes here - the all-devices
  // landing surface (currently the existing DevicesPage). Passed in so
  // SidebarColumn owns the exact destination.
  onHeaderClick: () => void;
  headerActive: boolean;
}

export function SidebarDevicesSection({
  serviceOnline,
  activeDeviceKey,
  compact,
  onSelect,
  onHeaderClick,
  headerActive,
}: SidebarDevicesSectionProps) {
  const { t } = useTranslation();
  const { push } = useToastSafe();
  const { unified, controlDevice } = useUnifiedDevices(serviceOnline);
  // Right-click menu state, held by key rather than by device object so a row
  // that disappears while the menu is open (unplug, simulator removed) closes
  // it instead of acting on a stale record.
  const [ctxMenu, setCtxMenu] = useState<{ key: string; x: number; y: number } | null>(null);

  // Same two paths the Devices-page card toggle takes: a promoted monitor's
  // gate is the display promote/demote API, every other Nexus Control device
  // goes through the handler control API. Undefined when neither applies, so
  // the menu omits the item rather than offering a dead click.
  const nexusControlToggleFor = useCallback((device: UnifiedDevice): (() => void) | undefined => {
    if (!device.supportsNexusControl) return undefined;
    const next = !device.nexusControlEnabled;
    const displayId = device.kind === 'panel' ? device.panelDevice?.displayId : undefined;
    if (displayId) {
      return () => {
        void (next ? promoteDisplayToPanel(displayId) : demoteDisplayPanel(displayId)).then(ok => {
          if (!ok) push({ title: t(next ? 'displays.error.promote' : 'displays.error.demote') });
        });
      };
    }
    const curatedId = device.curatedId;
    return curatedId ? () => void controlDevice(curatedId, next) : undefined;
  }, [controlDevice, push, t]);

  // Stable, deterministic order: connected first, then by category, then by
  // short name. Avoids reshuffles on transient disconnects within the
  // /devices polling cadence. Only navigable devices (those with their own
  // settings page) get a sidebar row - e.g. the MiniHub is controlled from
  // Cooling/Lighting, so it has no page and shouldn't deep-link to an empty one.
  // (Paired phone remotes are already excluded upstream in useUnifiedDevices -
  // they're remote controls, not devices.)
  const sorted = useMemo(() => {
    return unified
      .filter(d => d.navigable)
      .sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.shortName.localeCompare(b.shortName);
      });
  }, [unified]);

  const label = t('sidebar.section.devices');
  // Header reuses the device-row .item chrome (font, alignment, hover/active) at
  // full width, with a small faint .headerChip around the icon + label matching
  // the APPS header. Compact shows the usb glyph only, with a tooltip, like the
  // rows below it.
  const headerBtn = (
    <button
      type="button"
      className={classNames(styles.item, {
        [styles.active]: headerActive,
        [styles.itemCompact]: compact,
      })}
      onClick={onHeaderClick}
      aria-label={label}
      aria-pressed={headerActive}
    >
      <span className={styles.headerChip}>
        <span className={styles.headerIcon}><Usb size={ICON_SIZE} /></span>
        {!compact && <span className={styles.label}>{label}</span>}
      </span>
    </button>
  );
  // Right-click actions for the row under the cursor. Nexus Control mirrors
  // the Devices-page toggle; removing a simulator is dev-tools only, and only
  // offered for simulator kinds this menu knows how to tear down.
  const ctxDevice = ctxMenu ? sorted.find(d => d.key === ctxMenu.key) : undefined;
  const toggleNexusControl = ctxDevice ? nexusControlToggleFor(ctxDevice) : undefined;
  const removeSimulated = ctxDevice && DEV_TOOLS ? simulatedRemoverFor(ctxDevice) : undefined;
  const ctxItems = ctxDevice ? [
    // Same wording (and icons) as the lighting zone menu's per-device gate -
    // one sentence for one action, so the two can't drift apart.
    ...(toggleNexusControl ? [{
      key: 'nexus-control',
      label: t(ctxDevice.nexusControlEnabled ? 'lighting.devices.menuControlOff' : 'lighting.devices.menuControlOn'),
      icon: ctxDevice.nexusControlEnabled ? <Unlink size={14} /> : <Link2 size={14} />,
      onSelect: toggleNexusControl,
    }] : []),
    ...(removeSimulated ? [{
      key: 'remove-simulated',
      label: t('sidebar.device.removeSimulated'),
      icon: <Trash2 size={14} />,
      danger: true,
      onSelect: removeSimulated,
    }] : []),
  ] : [];
  const hasCtxItems = ctxItems.length > 0;

  // Nothing renders for an actionless row, and a menu that never mounted has
  // no outside-click or Escape handler to clear the key it latched. Same for a
  // row acted on and then removed: the teardown dispatches its change event
  // synchronously, unmounting the menu before its close animation runs, so
  // onClose never fires. Either way a stale key would make the menu reappear
  // unprompted at the old cursor position the moment that row became
  // actionable again (device replugged, simulator re-enabled, control gate
  // flipped service-side).
  useEffect(() => {
    if (ctxMenu && !hasCtxItems) setCtxMenu(null);
  }, [ctxMenu, hasCtxItems]);

  return (
    <section className={styles.section}>
      {compact ? <HoverTooltip body={label} side="right">{headerBtn}</HoverTooltip> : headerBtn}

      {sorted.length === 0 ? (
        !compact && (
          <div className={styles.empty}>{t('sidebar.devices.empty')}</div>
        )
      ) : (
        sorted.map(device => {
          const isActive = device.key === activeDeviceKey;
          const isSimulated = isSimulatedDevice(device);
          const tooltip = isSimulated
            ? `${device.shortName} (${t('devices.simulated')})`
            : device.shortName;
          const row = (
            <button
              key={device.key}
              type="button"
              className={classNames(styles.item, {
                [styles.active]: isActive,
                [styles.itemCompact]: compact,
                [styles.itemOffline]: !device.connected,
              })}
              onClick={() => onSelect(device.key)}
              onContextMenu={e => {
                e.preventDefault();
                setCtxMenu({ key: device.key, x: e.clientX, y: e.clientY });
              }}
              aria-label={compact ? tooltip : undefined}
            >
              <span
                className={styles.icon}
                role="img"
                aria-label={device.shortName}
                style={{ ['--device-icon' as string]: `url(${device.iconSrc})` }}
              />
              {!compact && (
                <>
                  <span className={styles.label}>{device.shortName}</span>
                  {isSimulated && (
                    <HoverTooltip body={t('devices.simulated')} side="top">
                      <span className={styles.simulatedBadge} role="img" aria-label={t('devices.simulated')}>
                        <Ghost size={14} aria-hidden />
                      </span>
                    </HoverTooltip>
                  )}
                  {device.warning && <DeviceWarningIcon code={device.warning} />}
                  {device.supportsNexusControl && !device.nexusControlEnabled && <NexusControlOffIcon />}
                </>
              )}
            </button>
          );
          return compact ? (
            <HoverTooltip key={device.key} body={tooltip} side="right">{row}</HoverTooltip>
          ) : row;
        })
      )}

      {ctxMenu && hasCtxItems && (
        <SidebarContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </section>
  );
}

/**
 * How to tear down `device`'s simulator, or undefined when it is real hardware
 * (or a simulator kind with no removal path). Each simulated device class has
 * its own switch: panels are a local-storage list, the Tryx cooler a single
 * flag, and a simulated Stream Deck lives service-side behind
 * /streamdeck/dev/simulate (whose DELETE broadcasts the `streamdeck` topic, so
 * the list refreshes itself).
 */
function simulatedRemoverFor(device: UnifiedDevice): (() => void) | undefined {
  if (device.panelDevice?.connectionKind === 'simulated') {
    const panelId = device.panelDevice.sourceId;
    return panelId ? () => setSimulatedPanelConnected(panelId, false) : undefined;
  }
  if (device.streamdeckSerial?.startsWith('sim-')) return () => { void clearSimulatedStreamDeck(); };
  if (device.simulated && device.curatedId === 'tryx') return () => setTryxSimulated(false);
  return undefined;
}

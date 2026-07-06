import { useMemo } from 'react';
import classNames from 'classnames';
import { Ghost, Usb } from 'lucide-react';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { DeviceWarningIcon } from '../components/common/DeviceWarningIcon/DeviceWarningIcon';
import { useUnifiedDevices } from '../hooks/useUnifiedDevices';
import { useTranslation } from '../lib/i18n';
import { ICON_SIZE } from './sidebarNav';
import styles from './SidebarDevicesSection.module.scss';

/**
 * The DEVICES section of the sidebar. Lists every detected + supported
 * device (panels, peripherals, curated hardware) the system knows
 * about, with a click navigating into that device's dedicated page.
 *
 * Wraps `useUnifiedDevices` - the same hook DevicesPage and the dashboard
 * Devices widget consume, so a click lands on the same device record.
 *
 * Empty state: a single hint row when no devices are connected. The header
 * always renders so the section structure is visible without devices.
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
  const { unified } = useUnifiedDevices(serviceOnline);

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
  // Header reuses the device-row .item chrome (font, alignment, hover/active)
  // and layers .headerBtn's divider - matching the APPS header. Compact shows
  // the usb glyph only, with a tooltip, like the rows below it.
  const headerBtn = (
    <button
      type="button"
      className={classNames(styles.item, styles.headerBtn, {
        [styles.active]: headerActive,
        [styles.itemCompact]: compact,
      })}
      onClick={onHeaderClick}
      aria-label={label}
      aria-pressed={headerActive}
    >
      <span className={styles.headerIcon}><Usb size={ICON_SIZE} /></span>
      {!compact && <span className={styles.label}>{label}</span>}
    </button>
  );
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
          const isSimulated = device.panelDevice?.connectionKind === 'simulated' || device.simulated === true;
          const tooltip = isSimulated
            ? `${device.shortName} (${t('devices.panels.simulated')})`
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
                    <Ghost
                      size={12}
                      className={styles.simulatedBadge}
                      aria-label={t('devices.panels.simulated')}
                    />
                  )}
                  {device.warning && <DeviceWarningIcon code={device.warning} />}
                </>
              )}
            </button>
          );
          return compact ? (
            <HoverTooltip key={device.key} body={tooltip} side="right">{row}</HoverTooltip>
          ) : row;
        })
      )}
    </section>
  );
}

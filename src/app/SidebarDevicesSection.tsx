import { useMemo } from 'react';
import classNames from 'classnames';
import { FlaskConical } from 'lucide-react';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useUnifiedDevices } from '../hooks/useUnifiedDevices';
import { useTranslation } from '../lib/i18n';
import styles from './SidebarDevicesSection.module.scss';

/**
 * The DEVICES section of the sidebar. Lists every detected + supported
 * device (panels, peripherals, curated hardware) the system knows
 * about, with a click navigating into that device's dedicated page.
 *
 * Wraps `useUnifiedDevices` — the same hook the DevicesPage and the
 * dashboard Devices widget consume, so a click here lands the user
 * on exactly the device they saw in either of those surfaces.
 *
 * Empty state: a single hint row when no devices are connected. The
 * section header itself is always rendered so the user can scan the
 * sidebar's structure even without devices.
 */
interface SidebarDevicesSectionProps {
  serviceOnline: boolean;
  // Currently active device key (the `subtab` portion of the route
  // when view === 'device'). Empty string when no device page is open.
  activeDeviceKey: string;
  // Compact = sidebar collapsed; render icon-only rows with tooltips.
  compact: boolean;
  onSelect: (deviceKey: string) => void;
  // Click on the section header itself routes here — the all-devices
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
  // settings page) get a sidebar row — e.g. the MiniHub is controlled from
  // Cooling/Lighting, so it has no page and shouldn't deep-link to an empty one.
  // Paired phone remotes (external-browser panel sessions from Pair Phone) are
  // managed from the Pair Phone button + Devices page, not listed as devices in
  // the sidebar — they're presence sessions, not hardware attached to this host.
  const sorted = useMemo(() => {
    return unified
      .filter(d => d.navigable)
      .filter(d => d.panelDevice?.connectionKind !== 'external-browser')
      .sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.shortName.localeCompare(b.shortName);
      });
  }, [unified]);

  const label = t('sidebar.section.devices');
  return (
    <section className={styles.section}>
      <button
        type="button"
        className={classNames(styles.headerBtn, {
          [styles.headerActive]: headerActive,
          [styles.headerCompactRow]: compact,
        })}
        onClick={onHeaderClick}
        aria-label={label}
      >
        {/* Compact: localized first letter (e.g. "D" for English
            "Devices"). Expanded: full label. The .headerLabel CSS
            paints a thin underline beneath whichever form renders so
            the header reads as a section heading rather than another
            tappable device row. */}
        <span className={styles.headerLabel}>
          {compact ? Array.from(label)[0]?.toLocaleUpperCase() ?? '' : label}
        </span>
      </button>

      {sorted.length === 0 ? (
        !compact && (
          <div className={styles.empty}>{t('sidebar.devices.empty')}</div>
        )
      ) : (
        sorted.map(device => {
          const isActive = device.key === activeDeviceKey;
          const isSimulated = device.panelDevice?.connectionKind === 'simulated';
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
                    <FlaskConical
                      size={12}
                      className={styles.simulatedBadge}
                      aria-label={t('devices.panels.simulated')}
                    />
                  )}
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

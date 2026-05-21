import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import classNames from 'classnames';
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
  sectionLabel: string;
  serviceState: ServiceState;
  headerSlot?: ReactNode;
  compact?: boolean;
  extraItems?: readonly ExtraNavItem[];
  extraSectionLabel?: string;
  extraActive?: string;
  extraOnChange?: (key: string) => void;
}

export function Sidebar({
  items, active, onChange, sectionLabel, serviceState,
  headerSlot, compact = false,
  extraItems, extraSectionLabel, extraActive, extraOnChange,
}: SidebarProps) {
  return (
    <div className={classNames(styles.nav, { [styles.navCompact]: compact })}>
      {headerSlot && (
        <div className={classNames(styles.serviceHeader, { [styles.serviceHeaderCompact]: compact })}>
          {headerSlot}
        </div>
      )}
      {!compact && sectionLabel && <div className={styles.sectionLabel}>{sectionLabel}</div>}
      {items.map((item) => {
        // Dot lights up while any fan is software-controlled (curve or
        // manual). BIOS-only means the user has not taken manual control of
        // anything, so the indicator stays dark.
        const coolActive = item.key === 'cooling'
          && ((serviceState.cooling?.activeCurveFanCount ?? 0) + (serviceState.cooling?.manualFans ?? 0)) > 0;
        const coolCalibrating = item.key === 'cooling' && serviceState.cooling?.calibrating;
        const lightActive = item.key === 'lighting' && serviceState.lighting?.running;
        const lightScanning = item.key === 'lighting' && serviceState.lighting?.scanning;
        const showDot = coolActive || coolCalibrating || lightActive || lightScanning;
        const dotPulsing = coolCalibrating || lightScanning;
        const button = (
          <button
            key={item.key}
            type="button"
            className={classNames(styles.item, {
              [styles.active]: item.key === active,
              [styles.itemCompact]: compact,
            })}
            onClick={() => onChange(item.key)}
            aria-label={compact ? item.label : undefined}
          >
            <span className={styles.icon}>
              {item.icon}
              {showDot && (
                <span className={classNames(styles.statusIndicator, { [styles.statusPulsing]: dotPulsing })} />
              )}
            </span>
            {!compact && <span className={styles.label}>{item.label}</span>}
          </button>
        );
        return compact ? (
          <HoverTooltip key={item.key} body={item.label} side="right">
            {button}
          </HoverTooltip>
        ) : button;
      })}
      {extraItems && extraItems.length > 0 && (
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
                <HoverTooltip key={item.key} body={item.label} side="right">
                  {link}
                </HoverTooltip>
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
              <HoverTooltip key={item.key} body={item.label} side="right">
                {button}
              </HoverTooltip>
            ) : button;
          })}
        </div>
      )}
    </div>
  );
}

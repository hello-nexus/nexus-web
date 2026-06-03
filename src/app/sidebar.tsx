import { type ReactNode } from 'react';
import { Unplug } from 'lucide-react';
import classNames from 'classnames';
import { ConflictWarningBadge } from '../components/common/Sidebar/ConflictWarning';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { NexusMark, NexusWordmark } from '../components/icons/NexusBrand';
import { useUiSettings } from '../hooks/useUiSettings';
import { useConflictApps } from '../hooks/useConflictApps';
import type { ConnectionState } from '../hooks/useServiceStatus';
import styles from '../App.module.scss';

// ── Sidebar brand (logo + wordmark at top of sidebar) ───────────────────

export function SidebarBrand({ compact, onLogoClick, logoLabel }: {
  compact: boolean;
  onLogoClick: () => void;
  logoLabel: string;
}) {
  // The brand logo navigates to the Apps landing. Collapse/expand lives in the
  // top bar now (plus the invisible right-edge strip in SidebarColumn).
  return (
    <div className={styles.sidebarBrand}>
      <HoverTooltip body={logoLabel} side="right">
        <button
          type="button"
          className={classNames(styles.sidebarBrandLogo, styles.sidebarBrandLogoBtn, {
            [styles.sidebarBrandLogoBtnWide]: !compact,
          })}
          onClick={onLogoClick}
          aria-label={logoLabel}
        >
          {compact ? (
            <NexusMark size={28} />
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NexusMark size={28} />
              <span style={{ display: 'inline-flex', marginLeft: 4 }}>
                <NexusWordmark height={16} />
              </span>
            </span>
          )}
        </button>
      </HoverTooltip>
    </div>
  );
}

// ── Connected profile slot ──────────────────────────────────────────────

// Wraps the profile dropdown so it remounts (via `key`) every time the service
// transitions offline -> online. The remount replays the one-shot fade-in
// animation defined in App.module.scss (.connectedSlotAnimate).
export function ConnectedProfileSlot({ connectEpoch, children }: {
  connectEpoch: number;
  children: ReactNode;
}) {
  return (
    <div key={connectEpoch} className={styles.connectedSlotAnimate}>
      {children}
    </div>
  );
}

// ── Not-connected badge (sits in the sidebar profile slot when offline) ──

export function NotConnectedBadge({ state, t, compact }: {
  state: ConnectionState;
  t: (key: string, params?: Record<string, string | number>) => string;
  compact: boolean;
}) {
  const label = state === 'checking'
    ? t('status.checking')
    : state === 'offline-installed'
    ? t('status.offline-installed')
    : t('status.offline');
  const isChecking = state === 'checking';

  const node = (
    <div
      className={classNames(styles.notConnected, { [styles.notConnectedCompact]: compact })}
      role="status"
      aria-live="polite"
    >
      <Unplug
        size={14}
        className={classNames(styles.notConnectedIcon, { [styles.notConnectedIconChecking]: isChecking })}
        aria-hidden
      />
      {!compact && <span className={styles.notConnectedLabel}>{label}</span>}
    </div>
  );
  return compact ? <HoverTooltip body={label} side="right">{node}</HoverTooltip> : node;
}

// ── Sidebar footer (debug + version) ────────────────────────────────────────

/**
 * Bottom-left sidebar conflict warning slot. The `disableConflictAlerts`
 * UiSettings pref gates the WebSocket subscription and is the same flag the
 * in-modal "Don't show again" checkbox persists.
 */
export function SidebarConflictSlot({ serviceOnline, compact }: {
  serviceOnline: boolean;
  compact: boolean;
}) {
  const { settings, update } = useUiSettings();
  const enabled = serviceOnline && !settings.disableConflictAlerts;
  const conflicts = useConflictApps(enabled);

  if (!enabled) return null;

  return (
    <ConflictWarningBadge
      conflicts={conflicts}
      compact={compact}
      onDismissForever={() => update({ disableConflictAlerts: true })}
    />
  );
}

// Version label pinned to the bottom-left of the layout.
export function PageVersionLabel() {
  return <span className={styles.pageVersion}>{__APP_VERSION__} alpha</span>;
}

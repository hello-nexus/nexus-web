import { type ReactNode } from 'react';
import { PanelLeftClose } from 'lucide-react';
import classNames from 'classnames';
import { ConflictWarningBadge } from '../components/common/Sidebar/ConflictWarning';
import { QosMark, QosWordmark } from '../components/icons/QosBrand';
import { useUiSettings } from '../hooks/useUiSettings';
import { useConflictApps } from '../hooks/useConflictApps';
import type { ConnectionState } from '../hooks/useServiceStatus';
import styles from '../App.module.scss';

// ── Sidebar brand (logo + wordmark at top of sidebar) ───────────────────

export function SidebarBrand({ compact, onToggleCompact, expandLabel, collapseLabel }: {
  compact: boolean;
  onToggleCompact: () => void;
  expandLabel: string;
  collapseLabel: string;
}) {
  return (
    <div className={classNames(styles.sidebarBrand, { [styles.sidebarBrandCompact]: compact })}>
      {compact ? (
        <button
          type="button"
          className={classNames(styles.sidebarBrandLogo, styles.sidebarBrandLogoBtn)}
          onClick={onToggleCompact}
          title={expandLabel}
          aria-label={expandLabel}
        >
          <QosMark size={20} />
        </button>
      ) : (
        <>
          <span className={styles.sidebarBrandWordmark}>
            <QosWordmark height={20} />
          </span>
          <button
            type="button"
            className={styles.sidebarBrandCollapse}
            onClick={onToggleCompact}
            title={collapseLabel}
            aria-label={collapseLabel}
          >
            <PanelLeftClose size={16} />
          </button>
        </>
      )}
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

  return (
    <div
      className={classNames(styles.notConnected, { [styles.notConnectedCompact]: compact })}
      title={compact ? label : undefined}
      role="status"
      aria-live="polite"
    >
      <span className={classNames(styles.notConnectedDot, { [styles.notConnectedDotChecking]: isChecking })} aria-hidden />
      {!compact && <span className={styles.notConnectedLabel}>{label}</span>}
    </div>
  );
}

// ── Sidebar footer (debug + version) ────────────────────────────────────────

/**
 * Bottom-left sidebar conflict warning slot. Reads the user's
 * <c>disableConflictAlerts</c> preference from the UiSettings context so we
 * can both gate the WebSocket subscription (no point polling when the user
 * hid the badge) and let the in-modal "Don't show again" checkbox persist
 * the flag through the same write path.
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

// Top-right debug-tools button. Lives at the layout root next to the
// caption buttons (Windows shell) or in the top-right corner of the
// viewport on other platforms. Replaces the old bottom-of-sidebar
// SidebarFooter slot.
export function TopRightDebugButton({ active, onDebug, icon }: {
  active: boolean;
  onDebug: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className={classNames(styles.topRightDebug, { [styles.topRightDebugActive]: active })}
      onClick={onDebug}
      title="Tools"
      aria-label="Tools"
      aria-pressed={active}
    >
      <span className={styles.topRightDebugIcon} aria-hidden>{icon}</span>
    </button>
  );
}

// Tiny + faded version label pinned to the bottom-left of the layout.
export function PageVersionLabel() {
  return <span className={styles.pageVersion}>{__APP_VERSION__}</span>;
}

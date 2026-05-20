import { type ReactNode } from 'react';
import { PanelLeftClose } from 'lucide-react';
import classNames from 'classnames';
import { Button } from '../components/common/Button/Button';
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
          <QosMark size={24} />
        </button>
      ) : (
        <>
          <span className={styles.sidebarBrandWordmark}>
            <QosWordmark height={40} />
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

export function SidebarFooter({ active, onDebug, debugIcon, compact }: {
  active: boolean;
  onDebug: () => void;
  debugIcon: ReactNode;
  compact: boolean;
}) {
  return (
    <div className={classNames(styles.footer, { [styles.footerCompact]: compact })}>
      <Button
        type="button"
        tone={active ? 'accent' : 'ghost'}
        size="sm"
        icon={debugIcon}
        onClick={onDebug}
        title="Tools"
        aria-label="Tools"
        aria-pressed={active}
      />

      {!compact && <span className={styles.version}>{__APP_VERSION__}</span>}
    </div>
  );
}

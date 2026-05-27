import { type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, PanelLeftClose, Unplug } from 'lucide-react';
import classNames from 'classnames';
import { ConflictWarningBadge } from '../components/common/Sidebar/ConflictWarning';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { NexusMark, NexusWordmark } from '../components/icons/NexusBrand';
import { useUiSettings } from '../hooks/useUiSettings';
import { useConflictApps } from '../hooks/useConflictApps';
import type { ConnectionState } from '../hooks/useServiceStatus';
import { useTranslation } from '../lib/i18n';
import styles from '../App.module.scss';

// ── Sidebar brand (logo + wordmark at top of sidebar) ───────────────────

export function SidebarBrand({ compact, onLogoClick, onToggleCompact, logoLabel, collapseLabel }: {
  compact: boolean;
  onLogoClick: () => void;
  onToggleCompact: () => void;
  logoLabel: string;
  collapseLabel: string;
}) {
  // The brand logo (mark when compact, mark+wordmark when expanded) is a
  // click target that navigates to the Apps landing — it never toggles the
  // sidebar's compact state. Collapse/expand is handled by the right-edge
  // strip (.collapseEdge) and the inline collapse button below.
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
          {compact ? <NexusMark size={28} /> : <NexusWordmark height={28} />}
        </button>
      </HoverTooltip>
      {!compact && (
        <HoverTooltip body={collapseLabel} side="right">
          <button
            type="button"
            className={styles.sidebarBrandCollapse}
            onClick={onToggleCompact}
            aria-label={collapseLabel}
          >
            <PanelLeftClose size={16} />
          </button>
        </HoverTooltip>
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

// Top-right action buttons (settings). Live at the layout root next to the
// caption buttons (Windows shell) or in the top-right corner of the viewport
// on other platforms. Styled to mimic Win11 caption buttons so the row reads
// as one integrated chrome strip.

// Browser-style back/forward chevrons pinned to the top-right strip, sitting
// to the left of the settings button with a small gap so they read as their
// own cluster. Desktop-app build only — see the __SERVICE_BUILD__ gate at
// the Dashboard render site.
export function TopRightNavButton({ direction, disabled, onClick }: {
  direction: 'back' | 'forward';
  disabled: boolean;
  onClick: () => void;
}) {
  const label = direction === 'back' ? 'Back' : 'Forward';
  const Icon = direction === 'back' ? ChevronLeft : ChevronRight;
  const positionClass = direction === 'back' ? styles.topRightNavBack : styles.topRightNavForward;
  return (
    <HoverTooltip body={label} side="bottom">
      <button
        type="button"
        className={classNames(styles.topRightAction, positionClass)}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        <span className={styles.topRightActionIcon} aria-hidden>
          <Icon size={14} />
        </span>
      </button>
    </HoverTooltip>
  );
}

export function TopRightSettingsButton({ active, onClick, icon }: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  const { t } = useTranslation();
  const label = t('nav.settings');
  return (
    <HoverTooltip body={label} side="bottom">
      <button
        type="button"
        className={classNames(styles.topRightAction, styles.topRightSettings, { [styles.topRightActionActive]: active })}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
      >
        <span className={styles.topRightActionIcon} aria-hidden>{icon}</span>
      </button>
    </HoverTooltip>
  );
}

// Tiny + faded version label pinned to the bottom-left of the layout.
export function PageVersionLabel() {
  return <span className={styles.pageVersion}>{__APP_VERSION__}</span>;
}

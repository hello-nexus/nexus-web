import { type ReactNode, useCallback, useEffect, useState } from 'react';
import classNames from 'classnames';
import { ConflictWarningBadge } from '../components/common/Sidebar/ConflictWarning';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { NexusMark, NexusWordmark } from '../components/icons/NexusBrand';
import { useUiSettings } from '../hooks/useUiSettings';
import { useConflictApps } from '../hooks/useConflictApps';
import { useNewConflictPulse } from '../hooks/useNewConflictPulse';
import { useTopicCallback } from '../hooks/useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import { useWindowDragRegion } from './useWindowDragRegion';
import { getUpdateStatus, UPDATE_TOPIC } from '../api/update';
import { pingService } from '../api/service';
import { UpdateBadge } from '../components/common/UpdateBadge/UpdateBadge';
import styles from '../App.module.scss';

// ── Sidebar brand (logo + wordmark at top of sidebar) ───────────────────

export function SidebarBrand({ compact, onLogoClick, logoLabel }: {
  compact: boolean;
  onLogoClick: () => void;
  logoLabel: string;
}) {
  // The brand logo navigates to the Apps landing. Collapse/expand lives in the
  // top bar now (plus the invisible right-edge strip in SidebarColumn).
  // The row's empty area drags the window (Windows shell only).
  const dragRegion = useWindowDragRegion();
  return (
    <div className={styles.sidebarBrand} {...dragRegion}>
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

// ── Top-bar status slots (conflict + update alerts) ─────────────────────────

/**
 * Conflict warning slot for the top bar. Owns the modal `open` state and the
 * `showConflictAlerts` pref (the in-modal "Don't show again" checkbox
 * toggles it), keeping the badge presentational.
 */
export function ConflictStatusSlot({ serviceOnline }: {
  serviceOnline: boolean;
}) {
  const { settings, update } = useUiSettings();
  const [open, setOpen] = useState(false);
  const suppressed = !settings.showConflictAlerts;
  // Keep the subscription alive while the modal is open even after the user
  // suppresses alerts, so the list they are acting on stays live instead of
  // collapsing to the "all clear" state mid-read.
  const enabled = serviceOnline && (!suppressed || open);
  const { conflicts, ready } = useConflictApps(enabled);
  const pulsing = useNewConflictPulse(conflicts, ready);

  return (
    <ConflictWarningBadge
      conflicts={conflicts}
      ready={ready}
      pulsing={pulsing}
      suppressed={suppressed}
      open={open}
      onOpenChange={setOpen}
      onSuppressedChange={value => update({ showConflictAlerts: !value })}
    />
  );
}

export function UpdateStatusSlot({ serviceOnline, onOpen, onInstall }: {
  serviceOnline: boolean;
  onOpen: () => void;
  onInstall: () => void;
}) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateMode, setUpdateMode] = useState<string>('');
  const [canAutoInstall, setCanAutoInstall] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState('');

  const refetch = useCallback(() => {
    getUpdateStatus().then(s => {
      if (s) {
        setUpdateAvailable(s.updateAvailable);
        setUpdateReady(s.updateReady);
        setUpdateMode(s.updateMode ?? '');
        setCanAutoInstall(s.canAutoInstall ?? true);
        setDownloadUrl(s.downloadUrl ?? '');
      }
    });
  }, []);

  useEffect(() => {
    if (!serviceOnline) return;
    refetch();
    // Fallback poll; the WS push below is the fast path. The mount fetch can
    // miss an update the startup check stages seconds after the dashboard
    // connects - the push closes that window without shortening this interval.
    const id = window.setInterval(refetch, 60_000);
    return () => window.clearInterval(id);
  }, [serviceOnline, refetch]);

  // Refetch the moment the service pushes an update-status change so the banner
  // appears on detection rather than at the next poll tick.
  useTopicCallback(UPDATE_TOPIC, serviceOnline, refetch);

  const isNotify = updateMode === 'notify';
  // Platforms that never stage an update (canAutoInstall=false) show the
  // banner purely on updateAvailable; updateMode/updateReady only matter
  // where a staged install exists to distinguish.
  const visible = canAutoInstall ? (isNotify ? updateAvailable : updateReady) : updateAvailable;
  if (!visible) return null;

  return (
    <UpdateBadge
      updateMode={updateMode}
      canAutoInstall={canAutoInstall}
      downloadUrl={downloadUrl}
      onOpen={onOpen}
      onInstall={onInstall}
    />
  );
}

// Version label pinned to the bottom-left of the layout.
export function PageVersionLabel() {
  const { t } = useTranslation();
  const [serviceVersion, setServiceVersion] = useState<string | null>(null);

  useEffect(() => {
    pingService().then(r => {
      if (r?.version) setServiceVersion(r.version);
    });
  }, []);

  // The label reflects the running build's reported version (which already
  // carries any "-beta.N" suffix). The update channel is a preference for future
  // updates, not the current build, so it must not alter this label.
  const version = serviceVersion ?? __APP_VERSION__;
  return <span className={styles.pageVersion}>{t('app.version', { version })}</span>;
}

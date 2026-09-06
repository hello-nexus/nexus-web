import { Spinner } from '../components/common/Spinner/Spinner';
import { hasNativeFindComputerBridge, openFindComputer } from './device/panelNativeBridge';
import { getActivePcId, listPairedPcs } from '../api/pairedPcs';
import { useTranslation } from '../lib/i18n';
import type { PanelSurface } from './types';
import styles from './PanelApp.module.scss';

export interface ConnectingTarget {
  name: string;
  host: string;
}

/**
 * The PC this panel is connecting to, or null when the question does not
 * apply. Only a paired phone has an answer: every other surface runs ON the
 * machine it talks to, so there is no remote name to show and nowhere for a
 * Cancel to go.
 *
 * The surface check must come FIRST. `listPairedPcs` runs the legacy
 * single-slot migration (pairedPcs.ts `ensureMigrated`), which synthesizes a
 * nameless record from any stored session token - and a kiosk holds one. This
 * gate would otherwise be the first thing to call it on a kiosk and would
 * create the phantom record itself.
 */
export function connectingTarget(
  surface: PanelSurface,
  unnamed: string,
): ConnectingTarget | null {
  if (surface !== 'phone') return null;
  try {
    const id = getActivePcId();
    if (!id) return null;
    const pc = listPairedPcs().find(p => p.id === id);
    if (!pc) return null;
    return {
      name: pc.machineName || unnamed,
      // The panel is served BY the PC on the LAN, so the origin is both the
      // truest address and the one the native screen shows (it carries the
      // pinned :9443). Over the relay the origin is the cloud, which says
      // nothing about the PC - a relay claim stores no address of its own
      // (PairRedirect passes only name/token/spki/region), so show none.
      host: isServedByPc() ? window.location.host : '',
    };
  } catch {
    return null;
  }
}

function isServedByPc(): boolean {
  // Mirrors api/service.ts's origin test without importing it, so this stays
  // free of the service module's connection state.
  return !/(^|\.)hellonexus\.com$/i.test(window.location.hostname);
}

// Mirrors the native wrapper's ConnectionLoadingView, which owns the screen
// until the HTML shell finishes loading and then hands the viewport to this.
// Before, that handoff went from a named screen with a Cancel to a bare
// spinner with no way out; both halves of one connect now say the same thing.
// The panel-device fetch this gates on runs over the relay tunnel for a remote
// session, so it can sit pending for seconds - the exit is live from the first
// frame rather than on a timer.
export function PanelLoadingGate({ surface }: { surface: PanelSurface }) {
  const { t } = useTranslation();
  const target = connectingTarget(surface, t('pairedPcs.unnamed'));
  // Cancel routes through the wrapper's find-computer bridge, the same escape
  // the native screen's Cancel lands on. A plain browser has no such surface.
  const canCancel = Boolean(target) && hasNativeFindComputerBridge();

  return (
    <div className={styles.loading}>
      {target && <img className={styles.loadingMark} src="/nexus-mark-color.png" alt="" />}
      <Spinner size={28} />
      {target && (
        <>
          <h2 className={styles.loadingTitle}>
            {t('panel.gate.connectingTo', { name: target.name })}
          </h2>
          {target.host && <p className={styles.loadingHost}>{target.host}</p>}
        </>
      )}
      {canCancel && (
        <button type="button" className={styles.loadingExit} onClick={openFindComputer}>
          {t('panel.gate.cancel')}
        </button>
      )}
    </div>
  );
}

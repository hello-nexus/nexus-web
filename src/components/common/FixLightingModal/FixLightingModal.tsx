import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, RotateCw, Wrench } from 'lucide-react';
import { pingService } from '../../../api/service';
import { restartService } from '../../../api/lighting';
import { useConflictApps } from '../../../hooks/useConflictApps';
import { useConflictAutostart } from '../../../hooks/useConflictAutostart';
import { useConflictRoster } from '../../../hooks/useConflictRoster';
import { useTranslation } from '../../../lib/i18n';
import { clearLightingRestart, markLightingRestart } from '../../../lib/postRestartRoute';
import { troubleshootingUrl } from '../../../lib/externalLinks';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { ConflictAllClear } from '../ConflictAllClear/ConflictAllClear';
import { ConflictAppCard } from '../ConflictAppCard/ConflictAppCard';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { TroubleshootLink } from '../TroubleshootLink/TroubleshootLink';
import { waitForServiceRestart } from './waitForRestart';
import styles from './FixLightingModal.module.scss';

const RESTART_POLL_MS = 500;
const RESTART_TIMEOUT_MS = 60_000;
const STEP_ICON_SIZE = 14;
const sleep = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); });

interface FixLightingModalProps {
  open: boolean;
  onClose: () => void;
  /** The device the modal was opened from; names it in the intro. */
  deviceName?: string;
}

function StepNumber({ n, done }: { n: number; done: boolean }) {
  return (
    <span className={done ? `${styles.stepNum} ${styles.stepDone}` : styles.stepNum}>
      {done ? <Check size={STEP_ICON_SIZE} /> : n}
    </span>
  );
}

function Step({ n, done, title, body, children }: { n: number; done: boolean; title: string; body: string; children?: ReactNode }) {
  return (
    <Card icon={<StepNumber n={n} done={done} />} title={title} subtitle={body}>
      {children}
    </Card>
  );
}

/**
 * Three ordered fixes for lighting that does not match or is not responding: close competing apps,
 * restart Nexus, power the PC off completely. Opened from the not-responding chip and strip and from
 * the Lighting page's "Lighting doesn't match?" link.
 */
export function FixLightingModal({ open, onClose, deviceName }: FixLightingModalProps) {
  const { t, language } = useTranslation();
  const { conflicts, ready } = useConflictApps(open);
  const { entries, conflicts: roster, markTerminated } = useConflictRoster(conflicts, open, ready);
  const { autostartByApp, disable } = useConflictAutostart(roster, open);
  const [restarting, setRestarting] = useState(false);
  const [restarted, setRestarted] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    if (!open) setRestarted(false);
  }, [open]);

  const handleRestart = async () => {
    if (restarting) return;
    setRestarting(true);
    setRestarted(false);
    markLightingRestart();
    try { await restartService(); } catch { /* the socket drops as the service restarts */ }
    let back = false;
    try {
      back = await waitForServiceRestart(
        pingService,
        { intervalMs: RESTART_POLL_MS, timeoutMs: RESTART_TIMEOUT_MS },
        sleep,
        () => !mountedRef.current,
      );
    } catch { /* a failed probe leaves the step idle */ }
    if (!mountedRef.current) return;
    // The window survived the restart, so there is nothing to reopen on Lighting.
    clearLightingRestart();
    setRestarting(false);
    setRestarted(back);
  };

  if (!open) return null;

  const allClosed = ready && entries.every(e => e.terminated);
  return (
    <DeviceModal
      open
      onClose={onClose}
      title={t('lighting.fix.title')}
      icon={<Wrench size={18} />}
      medium
    >
      <div className={styles.modal}>
        <p className={styles.intro}>
          {deviceName ? t('lighting.fix.introDevice', { device: deviceName }) : t('lighting.fix.intro')}
        </p>
        <div className={styles.steps}>
          <Step n={1} done={allClosed} title={t('lighting.fix.step1.title')} body={t('lighting.fix.step1.body')}>
            {ready && (
              <div className={styles.rows}>
                {entries.map(({ conflict, terminated }) => (
                  <ConflictAppCard
                    key={conflict.id}
                    conflict={conflict}
                    terminated={terminated}
                    onTerminated={() => markTerminated(conflict.id)}
                    autostart={autostartByApp.get(conflict.id)}
                    onDisableAutostart={() => disable(conflict.id)}
                  />
                ))}
                {allClosed && <ConflictAllClear />}
              </div>
            )}
          </Step>
          <Step n={2} done={restarted} title={t('lighting.fix.step2.title')} body={t('lighting.fix.step2.body')}>
            <div className={styles.actions}>
              <Button
                tone="accent"
                icon={<RotateCw size={14} />}
                loading={restarting}
                onClick={() => { void handleRestart(); }}
              >
                {restarting ? t('lighting.fix.step2.restarting') : restarted ? t('lighting.fix.step2.restarted') : t('lighting.fix.step2.title')}
              </Button>
            </div>
          </Step>
          <Step n={3} done={false} title={t('lighting.fix.step3.title')} body={t('lighting.fix.step3.body')} />
        </div>
        <div className={styles.footer}>
          <TroubleshootLink className={styles.footerLink} label={t('lighting.fix.stillIssues')} href={troubleshootingUrl('lighting', language)} />
        </div>
      </div>
    </DeviceModal>
  );
}

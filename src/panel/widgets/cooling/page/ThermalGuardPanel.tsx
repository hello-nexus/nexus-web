import { Wrench } from 'lucide-react';
import type { GuardResponse, HealState } from '../../../../api/cooling';
import { Button } from '../../../../components/common/Button/Button';
import { Notice } from '../../../../components/common/Notice/Notice';
import { useTranslation } from '../../../../lib/i18n';
import { guardBannerText, guardEnabled, healLines } from './guardUtils';
import styles from './ThermalGuardPanel.module.scss';

interface ThermalGuardPanelProps {
  guard: GuardResponse | null;
  onUndo: () => void;
  onKeep: () => void;
  /** A failed save, heal, undo or toggle, shown inline. */
  error?: string | null;
}

/** What a heal changed, with Undo and Keep. Shared by the cooling page and the immersive view. */
export function HealNotice({ heal, onUndo, onKeep, className }: {
  heal: HealState;
  /** Omit to hide Undo. */
  onUndo?: () => void;
  /** Accepts the heal for good; Undo then has nothing left to restore. */
  onKeep?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.heal} ${className ?? ''}`} role="status">
      <Wrench className={styles.healIcon} size={18} aria-hidden />
      <div className={styles.healBody}>
        <span>{t('cooling.guard.heal.title')}</span>
        <ul className={styles.healList}>
          {healLines(heal.channels, t).map((line, i) => <li key={heal.channels[i].id}>{line}</li>)}
        </ul>
      </div>
      <div className={styles.healActions}>
        {onUndo && <Button type="button" size="sm" tone="neutral" onClick={onUndo}>{t('cooling.guard.heal.undo')}</Button>}
        {onKeep && <Button type="button" size="sm" tone="accent" onClick={onKeep}>{t('cooling.guard.heal.keep')}</Button>}
      </div>
    </div>
  );
}

/** Inline failure line, for surfaces that cannot rely on a toast provider. */
export function GuardError({ message, className }: { message: string; className?: string }) {
  return (
    <Notice tone="critical" role="alert" className={className}>
      <span>{message}</span>
    </Notice>
  );
}

/**
 * Cooling page block for the thermal guard: the intervention banner, the
 * watchdog-latched banner, the post-heal notice with Undo, and inline errors.
 * The on/off switch lives in Settings. While the guard is off it shows nothing.
 */
export function ThermalGuardPanel({ guard, onUndo, onKeep, error = null }: ThermalGuardPanelProps) {
  const { t } = useTranslation();
  // Save and heal failures do not depend on the guard having loaded.
  const errorNode = error ? <GuardError message={error} /> : null;
  if (!guard || !guardEnabled(guard)) return errorNode && <div className={styles.panel}>{errorNode}</div>;

  const banner = guardBannerText(guard, t);
  const heal = guard.heal.undoAvailable ? guard.heal : null;
  if (!banner && !guard.watchdogLatched && !heal && !errorNode) return null;

  return (
    <div className={styles.panel}>
      {guard.watchdogLatched && (
        <Notice tone="critical" role="alert">
          <span>{t('cooling.guard.latched')}</span>
        </Notice>
      )}
      {banner && (
        <Notice tone={guard.state === 'escalated' ? 'critical' : 'warning'} role="alert">
          <span>{banner}</span>
        </Notice>
      )}
      {heal && <HealNotice heal={heal} onUndo={onUndo} onKeep={onKeep} />}
      {errorNode}
    </div>
  );
}

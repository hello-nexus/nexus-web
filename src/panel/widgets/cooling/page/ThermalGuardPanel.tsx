import { TriangleAlert, Wrench } from 'lucide-react';
import type { GuardResponse, HealState } from '../../../../api/cooling';
import { Button } from '../../../../components/common/Button/Button';
import { useTranslation } from '../../../../lib/i18n';
import { guardBannerText, guardEnabled, healLines } from './guardUtils';
import styles from './ThermalGuardPanel.module.scss';

interface ThermalGuardPanelProps {
  guard: GuardResponse | null;
  onUndo: () => void;
  /** A failed save, heal, undo or toggle, shown inline. */
  error?: string | null;
}

/** What a heal changed, with Undo. Shared by the cooling page and the immersive view. */
export function HealNotice({ heal, onUndo, onDismiss, className }: {
  heal: HealState;
  /** Omit to hide Undo, e.g. once the service no longer holds an undo snapshot. */
  onUndo?: () => void;
  onDismiss?: () => void;
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
      {onUndo && <Button type="button" size="sm" onClick={onUndo}>{t('cooling.guard.heal.undo')}</Button>}
      {onDismiss && <Button type="button" size="sm" onClick={onDismiss}>{t('confirm.ok')}</Button>}
    </div>
  );
}

/** Inline failure line, for surfaces that cannot rely on a toast provider. */
export function GuardError({ message, className }: { message: string; className?: string }) {
  return (
    <div className={`${styles.banner} ${className ?? ''}`} role="alert" data-state="error">
      <TriangleAlert className={styles.bannerIcon} size={18} aria-hidden />
      <span>{message}</span>
    </div>
  );
}

/**
 * Cooling page block for the thermal guard: the intervention banner, the
 * watchdog-latched banner, the post-heal notice with Undo, and inline errors.
 * The on/off switch lives in Settings. While the guard is off it shows nothing.
 */
export function ThermalGuardPanel({ guard, onUndo, error = null }: ThermalGuardPanelProps) {
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
        <div className={styles.banner} role="alert" data-state="escalated">
          <TriangleAlert className={styles.bannerIcon} size={18} aria-hidden />
          <span>{t('cooling.guard.latched')}</span>
        </div>
      )}
      {banner && (
        <div className={styles.banner} role="alert" data-state={guard.state}>
          <TriangleAlert className={styles.bannerIcon} size={18} aria-hidden />
          <span>{banner}</span>
        </div>
      )}
      {heal && <HealNotice heal={heal} onUndo={onUndo} />}
      {errorNode}
    </div>
  );
}

import { ShieldCheck, TriangleAlert, Wrench } from 'lucide-react';
import type { GuardResponse, HealState } from '../../../../api/cooling';
import { Button } from '../../../../components/common/Button/Button';
import { SettingToggle } from '../../../../components/common/SettingRow/SettingRow';
import { useTranslation } from '../../../../lib/i18n';
import { guardBannerText, guardLimitText, healLines } from './guardUtils';
import styles from './ThermalGuardPanel.module.scss';

interface ThermalGuardPanelProps {
  guard: GuardResponse | null;
  onToggle: (enabled: boolean) => void;
  onUndo: () => void;
  /** Disables the switch while its request is in flight. */
  toggling?: boolean;
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

/** Thermal guard switch with its limit, the intervention banner, and the post-heal notice with Undo. */
export function ThermalGuardPanel({ guard, onToggle, onUndo, toggling = false, error = null }: ThermalGuardPanelProps) {
  const { t } = useTranslation();
  // Save and heal failures do not depend on the guard having loaded.
  if (!guard) return error ? <div className={styles.panel}><GuardError message={error} /></div> : null;

  const banner = guardBannerText(guard, t);
  const limit = guardLimitText(guard, t);
  const enabled = guard.state !== 'off';
  const heal = guard.heal.undoAvailable ? guard.heal : null;

  return (
    <div className={styles.panel}>
      <SettingToggle
        label={t('cooling.guard.label')}
        description={`${t('cooling.guard.description')}${limit && enabled ? ` ${limit}` : ''}`}
        icon={<ShieldCheck size={18} />}
        iconLeading="subtle"
        checked={enabled}
        disabled={toggling}
        onChange={onToggle}
      />
      {guard.state === 'inactive' && (
        <div className={styles.banner} role="status" data-state="inactive">
          <TriangleAlert className={styles.bannerIcon} size={18} aria-hidden />
          <span>{t('cooling.guard.inactive')}</span>
        </div>
      )}
      {banner && (
        <div className={styles.banner} role="alert" data-state={guard.state}>
          <TriangleAlert className={styles.bannerIcon} size={18} aria-hidden />
          <span>{banner}</span>
        </div>
      )}
      {heal && <HealNotice heal={heal} onUndo={onUndo} />}
      {error && <GuardError message={error} />}
    </div>
  );
}

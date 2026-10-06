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
}

/** What a heal changed, with Undo. Shared by the cooling page and the immersive view. */
export function HealNotice({ heal, onUndo, className }: { heal: HealState; onUndo: () => void; className?: string }) {
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
      <Button type="button" size="sm" onClick={onUndo}>{t('cooling.guard.heal.undo')}</Button>
    </div>
  );
}

/** Thermal guard switch with its limit, the intervention banner, and the post-heal notice with Undo. */
export function ThermalGuardPanel({ guard, onToggle, onUndo, toggling = false }: ThermalGuardPanelProps) {
  const { t } = useTranslation();
  if (!guard) return null;

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
    </div>
  );
}

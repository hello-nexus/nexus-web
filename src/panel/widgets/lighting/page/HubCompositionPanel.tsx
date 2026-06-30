import { useId } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { Toggle } from '../../../../components/common/Toggle/Toggle';
import { Button } from '../../../../components/common/Button/Button';
import type { HubComposition, HubCompositionPatch } from '../../../../api/lighting';
import styles from './HubCompositionPanel.module.scss';

interface Props {
  composition: HubComposition;
  onChange: (patch: HubCompositionPatch) => void;
  /** Fan count of the port whose LED space the editor is rendering. Omitted for
   * hubs without a per-port fan count (e.g. SmartHub). */
  fanCount?: number;
  /** When set, render a button that deep-links to the hub's device page (where
   * per-port fan counts - and thus the device set - are configured). */
  onOpenDeviceSettings?: () => void;
}

// A single composition row styled like the zone-selection bar.
export function HubCompositionPanel({ composition, onChange, fanCount, onOpenDeviceSettings }: Props) {
  const { t } = useTranslation();
  const mirrorLabelId = useId();
  const combineLabelId = useId();

  return (
    <div className={styles.hubBar}>
      {composition.hasMirror && (
        <span className={styles.toggleItem}>
          <Toggle
            checked={composition.mirror}
            onChange={v => onChange({ mirror: v })}
            ariaLabelledBy={mirrorLabelId}
          />
          <span id={mirrorLabelId}>{t('lighting.ledMap.hubMirror')}</span>
        </span>
      )}
      {composition.hasRingsAxis && (
        <span className={styles.toggleItem}>
          <Toggle
            checked={composition.combineRings}
            onChange={v => onChange({ combineRings: v })}
            ariaLabelledBy={combineLabelId}
          />
          <span id={combineLabelId}>{t('lighting.ledMap.hubCombineRings')}</span>
        </span>
      )}
      <div className={styles.spacer} />
      {fanCount != null && (
        <span className={styles.fanCount}>
          {t('lighting.ledMap.hubFanCount', { count: String(fanCount) })}
        </span>
      )}
      {onOpenDeviceSettings && (
        <Button
          size="sm"
          tone="neutral"
          icon={<SlidersHorizontal size={14} />}
          onClick={onOpenDeviceSettings}
        >
          {t('lighting.ledMap.hubOpenDeviceSettings')}
        </Button>
      )}
    </div>
  );
}

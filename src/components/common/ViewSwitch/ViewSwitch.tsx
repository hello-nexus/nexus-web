import { Box } from 'lucide-react';
import { ChipGroup } from '../ChipGroup/ChipGroup';
import { useTranslation } from '../../../lib/i18n';
import styles from './ViewSwitch.module.scss';

export type ViewDimension = '2d' | '3d';

export interface ViewSwitchProps {
  /** Which view is shown. */
  value: ViewDimension;
  onChange: (next: ViewDimension) => void;
  /** Label of the 2D segment, then of the 3D one. */
  labels: { '2d': string; '3d': string };
  ariaLabel: string;
  className?: string;
}

/**
 * The 2D / 3D canvas switch: a ChipGroup whose segments each start with a small "2D" or "3D" pill, then the view's name.
 * The 3D segment keeps a cube and an accent tint while idle, so the richer view reads as the one to try.
 */
export function ViewSwitch({ value, onChange, labels, ariaLabel, className }: ViewSwitchProps) {
  const { t } = useTranslation();
  const segment = (dim: ViewDimension) => (
    <span className={styles.segment}>
      <span className={styles.pill} data-dim={dim}>
        {dim === '3d' && <Box size={11} strokeWidth={2} aria-hidden />}
        {t(dim === '3d' ? 'lighting.scene.view.3d' : 'lighting.scene.view.2d')}
      </span>
      {labels[dim]}
    </span>
  );
  return (
    <ChipGroup
      className={`${styles.switch} ${className ?? ''}`}
      ariaLabel={ariaLabel}
      // eslint-disable-next-line i18next/no-literal-string -- option keys, not text
      options={[{ key: '2d', label: segment('2d') }, { key: '3d', label: segment('3d') }]}
      activeKey={value}
      onChange={next => onChange(next === '3d' ? '3d' : '2d')}
    />
  );
}

import { useTranslation } from '../../../lib/i18n';
import styles from './Spinner.module.scss';

export interface SpinnerProps {
  size?: number;
  color?: string;
}

export function Spinner({ size = 20, color = 'var(--accent, #2563eb)' }: SpinnerProps) {
  const { t } = useTranslation();
  const sw = Math.max(2, Math.round(size / 10));
  const r = (size - sw) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      className={styles.spinner} role="img" aria-label={t('common.loading')}
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={sw} />
      <circle
        cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={`${circ * 0.28} ${circ}`}
      >
        <animateTransform
          attributeName="transform" type="rotate"
          from={`0 ${c} ${c}`} to={`360 ${c} ${c}`}
          dur="0.8s" repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

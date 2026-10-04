import { useTranslation } from '../../../../lib/i18n';
import styles from './Scene.module.scss';

/** The lighting canvas's 2D | 3D switch; 3D lays devices out as the scene camera sees them. */
export function SceneViewSwitch({ value, onChange }: { value: '2d' | '3d'; onChange: (next: '2d' | '3d') => void }) {
  const { t } = useTranslation();
  return (
    <div className={`${styles.viewSwitch} ${styles.pillGroup}`} role="radiogroup" aria-label={t('lighting.scene.viewSwitch')}>
      {(['2d', '3d'] as const).map(v => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={`${styles.pillButton} ${value === v ? styles.pillButtonActive : ''}`}
          onClick={() => { if (v !== value) onChange(v); }}
        >
          {t(`lighting.scene.view.${v}`)}
        </button>
      ))}
    </div>
  );
}

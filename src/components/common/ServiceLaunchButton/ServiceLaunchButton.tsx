import { Loader2, ShieldCheck } from 'lucide-react';
import classNames from 'classnames';
import { useTranslation } from '../../../lib/i18n';
import { triggerLaunch, useLaunchState } from '../../../hooks/useServiceLaunch';
import styles from './ServiceLaunchButton.module.scss';

interface ServiceLaunchButtonProps {
  className?: string;
  // When true, renders without the text label - icon-only square. Used in
  // the compact sidebar where the column is too narrow for a labelled button.
  iconOnly?: boolean;
}

export function ServiceLaunchButton({ className, iconOnly = false }: ServiceLaunchButtonProps) {
  const { t } = useTranslation();
  const launching = useLaunchState();
  const label = t('status.launch');
  const launchingLabel = t('status.launching');
  return (
    <button
      type="button"
      className={classNames(styles.button, { [styles.buttonIconOnly]: iconOnly }, className)}
      onClick={triggerLaunch}
      disabled={launching}
      title={iconOnly ? (launching ? launchingLabel : label) : undefined}
      aria-label={launching ? launchingLabel : label}
    >
      <span className={classNames(styles.icon, { [styles.iconSpin]: launching })}>
        {launching ? <Loader2 size={16} /> : <ShieldCheck size={16} />}
      </span>
      {!iconOnly && (
        <span className={styles.label}>{launching ? launchingLabel : label}</span>
      )}
    </button>
  );
}

import { DoorOpen } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import styles from './SkipOnboardingButton.module.scss';

interface SkipOnboardingButtonProps {
  onSkip: () => void;
}

/**
 * Deliberately low-emphasis escape hatch, pinned to the top-right of every
 * onboarding screen after the welcome step. Not offered on the welcome step
 * itself: there is nothing to skip until the user has entered the sequence.
 */
export function SkipOnboardingButton({ onSkip }: SkipOnboardingButtonProps) {
  const { t } = useTranslation();
  return (
    <button type="button" className={styles.skip} onClick={onSkip}>
      <DoorOpen size={15} aria-hidden />
      <span>{t('onboarding.skip')}</span>
    </button>
  );
}

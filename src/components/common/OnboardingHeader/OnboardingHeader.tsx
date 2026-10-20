import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../Button/Button';
import { SkipOnboardingButton } from '../SkipOnboardingButton/SkipOnboardingButton';
import styles from './OnboardingHeader.module.scss';

export interface OnboardingHeaderProps {
  /** Steps back to the previous screen; the Back button only renders when provided. */
  onBack?: () => void;
  /** Skips every remaining onboarding step; the top-right escape hatch only renders when provided. */
  onSkip?: () => void;
  backDisabled?: boolean;
  skipDisabled?: boolean;
}

/**
 * Top bar shared by every onboarding screen after the welcome step: Back in
 * the left corner, Skip in the right. Spans the surface edges, not the
 * centered content column. An absent side keeps its slot so the other stays put.
 */
export function OnboardingHeader({ onBack, onSkip, backDisabled, skipDisabled }: OnboardingHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.header}>
      {onBack ? (
        <Button tone="ghost" size="sm" icon={<ArrowLeft />} disabled={backDisabled} onClick={onBack}>
          {t('nav.back')}
        </Button>
      ) : <span />}
      {onSkip ? <SkipOnboardingButton onSkip={onSkip} disabled={skipDisabled} /> : <span />}
    </div>
  );
}

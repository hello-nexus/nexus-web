import type { ReactNode } from 'react';
import { Button } from '../Button/Button';
import styles from './OnboardingFooter.module.scss';

export interface OnboardingFooterProps {
  label: ReactNode;
  onContinue: () => void;
  /** Spinner in place of the label while the action runs. */
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  /** Failure line shown above the buttons. */
  error?: string;
  /** Optional secondary action, rendered before the primary. */
  secondary?: { label: ReactNode; onClick: () => void; disabled?: boolean };
  /** Closing note (OnboardingNote) shown above the error and buttons. */
  children?: ReactNode;
}

/**
 * Bottom block shared by every onboarding screen: optional note, optional
 * error line, then the primary action (with an optional secondary beside it).
 */
export function OnboardingFooter({ label, onContinue, loading, disabled, icon, error, secondary, children }: OnboardingFooterProps) {
  return (
    <div className={styles.footer}>
      {children}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        {secondary && (
          <Button tone="neutral" size="lg" onClick={secondary.onClick} disabled={secondary.disabled} className={styles.action}>
            {secondary.label}
          </Button>
        )}
        <Button
          tone="accent"
          size="lg"
          icon={icon}
          onClick={onContinue}
          loading={loading}
          disabled={disabled}
          loadingHidesLabel
          className={styles.action}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}

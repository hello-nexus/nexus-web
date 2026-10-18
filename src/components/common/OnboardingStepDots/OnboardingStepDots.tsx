import { PanelPageIndicator } from '../../../panel/chrome/PanelPageIndicator';
import styles from './OnboardingStepDots.module.scss';

export interface OnboardingStepDotsProps {
  /** Position among the onboarding steps this user will see; nothing renders without it. */
  step?: { total: number; active: number };
}

/** Progress dots pinned to the bottom center of every full-viewport onboarding screen. */
export function OnboardingStepDots({ step }: OnboardingStepDotsProps) {
  if (!step) return null;
  return <PanelPageIndicator progress total={step.total} active={step.active} className={styles.dots} />;
}

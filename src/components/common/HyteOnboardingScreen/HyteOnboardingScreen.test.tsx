import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HyteOnboardingScreen } from './HyteOnboardingScreen';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('HyteOnboardingScreen', () => {
  it('renders the thanks copy and the four rows', () => {
    render(<HyteOnboardingScreen open onContinue={vi.fn()} />);
    expect(screen.getByText('hyteOnboarding.title')).toBeTruthy();
    for (const k of ['hyte', 'devices', 'backup', 'choice']) {
      expect(screen.getByText(`hyteOnboarding.card.${k}.title`)).toBeTruthy();
    }
  });

  it('renders nothing when closed', () => {
    render(<HyteOnboardingScreen open={false} onContinue={vi.fn()} />);
    expect(screen.queryByText('hyteOnboarding.title')).toBeNull();
  });

  it('wires Continue, Back and Skip onboarding', () => {
    const onContinue = vi.fn();
    const onBack = vi.fn();
    const onSkip = vi.fn();
    render(<HyteOnboardingScreen open onContinue={onContinue} onBack={onBack} onSkipOnboarding={onSkip} />);
    fireEvent.click(screen.getByText('hyteOnboarding.continue'));
    fireEvent.click(screen.getByText('nav.back'));
    fireEvent.click(screen.getByText('onboarding.skip'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('offers no Back button without a handler', () => {
    render(<HyteOnboardingScreen open onContinue={vi.fn()} />);
    expect(screen.queryByText('nav.back')).toBeNull();
  });

  it('renders no toggles or switches, only navigation buttons', () => {
    render(<HyteOnboardingScreen open onContinue={vi.fn()} onBack={vi.fn()} onSkipOnboarding={vi.fn()} />);
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});

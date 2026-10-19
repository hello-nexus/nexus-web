import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingHeader } from './OnboardingHeader';

describe('OnboardingHeader', () => {
  it('renders neither button without handlers', () => {
    render(<OnboardingHeader />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows Back only when onBack is given and fires it', () => {
    const onBack = vi.fn();
    render(<OnboardingHeader onBack={onBack} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows Skip only when onSkip is given and fires it', () => {
    const onSkip = vi.fn();
    render(<OnboardingHeader onSkip={onSkip} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('shows both and honors the disabled flags', () => {
    const onBack = vi.fn();
    const onSkip = vi.fn();
    render(<OnboardingHeader onBack={onBack} onSkip={onSkip} backDisabled skipDisabled />);
    const [back, skip] = screen.getAllByRole('button');
    expect(back).toBeDisabled();
    expect(skip).toBeDisabled();
    fireEvent.click(back);
    fireEvent.click(skip);
    expect(onBack).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });
});

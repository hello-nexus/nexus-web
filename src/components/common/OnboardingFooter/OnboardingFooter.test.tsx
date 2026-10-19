import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingFooter } from './OnboardingFooter';

describe('OnboardingFooter', () => {
  it('fires the primary action', () => {
    const onContinue = vi.fn();
    render(<OnboardingFooter label="Continue" onContinue={onContinue} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('disables the primary action when disabled or loading', () => {
    const onContinue = vi.fn();
    const { rerender } = render(<OnboardingFooter label="Continue" onContinue={onContinue} disabled />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    rerender(<OnboardingFooter label="Continue" onContinue={onContinue} loading />);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('renders the note, the error, and a secondary action when given', () => {
    const onClick = vi.fn();
    render(
      <OnboardingFooter
        label="Continue"
        onContinue={() => {}}
        error="Something failed"
        secondary={{ label: 'Skip import', onClick }}
      >
        <p>Change this any time</p>
      </OnboardingFooter>,
    );
    expect(screen.getByText('Change this any time')).toBeInTheDocument();
    expect(screen.getByText('Something failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip import' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('omits the error and secondary by default and disables the secondary on request', () => {
    const { rerender } = render(<OnboardingFooter label="Continue" onContinue={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('Something failed')).toBeNull();
    rerender(<OnboardingFooter label="Continue" onContinue={() => {}} secondary={{ label: 'Later', onClick: () => {}, disabled: true }} />);
    expect(screen.getByRole('button', { name: 'Later' })).toBeDisabled();
  });
});

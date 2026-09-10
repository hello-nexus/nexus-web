import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictOnboardingScreen } from './ConflictOnboardingScreen';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join('|')}` : key),
  }),
}));

const mockKill = vi.fn();
vi.mock('../../../api/conflicts', () => ({
  killConflict: (...args: any[]) => mockKill(...args),
  // The boot-entry read has its own tests; here it only has to resolve so the
  // screen renders without an unhandled rejection.
  fetchConflictAutostart: () => Promise.resolve([]),
  disableConflictAutostart: () => Promise.resolve({ error: false, msg: 'Ok', disabled: 0 }),
}));

beforeEach(() => {
  mockKill.mockReset();
});

const icue = { id: 'icue', displayName: 'Corsair iCUE', category: 'lighting', processName: 'iCUE', pid: 396 };
const cam = { id: 'nzxt-cam', displayName: 'NZXT CAM', category: 'lighting', processName: 'NZXT CAM', pid: 13844 };

describe('ConflictOnboardingScreen', () => {
  it('lists nothing until the detected-app snapshot resolves', () => {
    render(<ConflictOnboardingScreen open ready={false} conflicts={[icue, cam]} onComplete={() => {}} />);

    expect(screen.queryByText('Corsair iCUE')).not.toBeInTheDocument();
  });

  it('lists every detected app', () => {
    render(<ConflictOnboardingScreen open ready conflicts={[icue, cam]} onComplete={() => {}} />);

    expect(screen.getByText('Corsair iCUE')).toBeInTheDocument();
    // NZXT CAM's display name and process name are the same string.
    expect(screen.getAllByText('NZXT CAM').length).toBeGreaterThan(0);
    expect(screen.getByText('conflicts.modal.pid:396')).toBeInTheDocument();
  });


  it('ends nothing on mount or on continue', async () => {
    const onComplete = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue, cam]} onComplete={onComplete} />);
    expect(mockKill).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.onboarding.done' }));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mockKill).not.toHaveBeenCalled();
  });

  it('shows the all-clear state and a Continue label when nothing is detected', () => {
    render(<ConflictOnboardingScreen open ready conflicts={[]} onComplete={() => {}} />);

    expect(screen.getByText('conflicts.modal.empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.onboarding.continue' })).toBeInTheDocument();
  });

  it('renders Back and Skip only when their handlers are given', () => {
    const { unmount } = render(<ConflictOnboardingScreen open ready conflicts={[icue]} onComplete={() => {}} />);
    expect(screen.queryByRole('button', { name: 'nav.back' })).not.toBeInTheDocument();
    unmount();

    const onBack = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue]} onComplete={() => {}} onBack={onBack} onSkipOnboarding={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'nav.back' }));
    expect(onBack).toHaveBeenCalled();
  });
});

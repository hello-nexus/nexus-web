import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictOnboardingScreen } from './ConflictOnboardingScreen';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockKill = vi.fn();
const mockDisableAutostart = vi.fn();

vi.mock('../../../api/conflicts', () => ({
  killConflict: (...args: any[]) => mockKill(...args),
  disableConflictAutostart: (...args: any[]) => mockDisableAutostart(...args),
}));

beforeEach(() => {
  mockKill.mockReset();
  mockDisableAutostart.mockReset();
});

const icue = { id: 'icue', displayName: 'Corsair iCUE', category: 'lighting', processName: 'iCUE', pid: 396 };
const cam = { id: 'nzxt-cam', displayName: 'NZXT CAM', category: 'lighting', processName: 'NZXT CAM', pid: 13844 };

describe('ConflictOnboardingScreen', () => {
  it('lists every detected app', () => {
    render(<ConflictOnboardingScreen open conflicts={[icue, cam]} onComplete={() => {}} />);

    expect(screen.getByText('Corsair iCUE')).toBeInTheDocument();
    // NZXT CAM's display name and process name are the same string.
    expect(screen.getAllByText('NZXT CAM').length).toBeGreaterThan(0);
    expect(screen.getByText('PID 396')).toBeInTheDocument();
  });

  it('offers the startup control only for an app whose entry resolved', () => {
    render(<ConflictOnboardingScreen
      open
      conflicts={[icue, cam]}
      autostartById={{ icue: [{ kind: 'runKeyMachine', entryName: 'Corsair iCUE5 Software' }], 'nzxt-cam': [] }}
      onComplete={() => {}}
    />);

    expect(screen.getAllByRole('button', { name: 'conflicts.modal.removeStartup' })).toHaveLength(1);
  });

  it('ends nothing and clears no autostart on mount or on continue', async () => {
    const onComplete = vi.fn();
    render(<ConflictOnboardingScreen
      open
      conflicts={[icue, cam]}
      autostartById={{ icue: [{ kind: 'service', entryName: 'CorsairDeviceListerService' }] }}
      onComplete={onComplete}
    />);
    expect(mockKill).not.toHaveBeenCalled();
    expect(mockDisableAutostart).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.onboarding.done' }));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mockKill).not.toHaveBeenCalled();
    expect(mockDisableAutostart).not.toHaveBeenCalled();
  });

  it('shows the all-clear state and a Continue label when nothing is detected', () => {
    render(<ConflictOnboardingScreen open conflicts={[]} onComplete={() => {}} />);

    expect(screen.getByText('conflicts.onboarding.allClearTitle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.onboarding.continue' })).toBeInTheDocument();
  });

  it('renders Back and Skip only when their handlers are given', () => {
    const { unmount } = render(<ConflictOnboardingScreen open conflicts={[icue]} onComplete={() => {}} />);
    expect(screen.queryByRole('button', { name: 'nav.back' })).not.toBeInTheDocument();
    unmount();

    const onBack = vi.fn();
    render(<ConflictOnboardingScreen open conflicts={[icue]} onComplete={() => {}} onBack={onBack} onSkipOnboarding={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'nav.back' }));
    expect(onBack).toHaveBeenCalled();
  });
});

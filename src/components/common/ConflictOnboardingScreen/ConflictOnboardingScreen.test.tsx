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
const mockDisableAutostart = vi.fn();
const mockFetchAutostart = vi.fn();
vi.mock('../../../api/conflicts', () => ({
  killConflict: (...args: any[]) => mockKill(...args),
  fetchConflictAutostart: (...args: any[]) => mockFetchAutostart(...args),
  disableConflictAutostart: (...args: any[]) => mockDisableAutostart(...args),
}));

const mockUninstall = vi.fn();
vi.mock('../../../api/migration', () => ({
  uninstallNexus2: (...args: any[]) => mockUninstall(...args),
}));

let mockExclusions: string[] = [];
vi.mock('../../../hooks/useUiSettings', () => ({
  useConflictAutoKillExclusions: () => mockExclusions,
}));

beforeEach(() => {
  mockKill.mockReset();
  mockKill.mockResolvedValue({ error: false, msg: 'Ok', killed: true });
  mockDisableAutostart.mockReset();
  mockDisableAutostart.mockResolvedValue({ error: false, msg: 'Ok', disabled: 1 });
  // The boot-entry read has its own tests; here it only has to resolve so the
  // screen renders without an unhandled rejection.
  mockFetchAutostart.mockReset();
  mockFetchAutostart.mockResolvedValue([]);
  mockUninstall.mockReset();
  mockUninstall.mockResolvedValue({ error: false, msg: 'Ok' });
  mockExclusions = [];
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


  it('ends nothing on mount or on skip', async () => {
    const onComplete = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue, cam]} onComplete={onComplete} nexus2Installed />);
    expect(mockKill).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.onboarding.skip' }));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mockKill).not.toHaveBeenCalled();
    expect(mockUninstall).not.toHaveBeenCalled();
  });

  it('resolve all ends every app, turns off every boot entry, uninstalls Nexus 2, then completes', async () => {
    mockFetchAutostart.mockResolvedValue([{ id: 'icue', entries: [{ kind: 'service', entryName: 'CorsairService' }] }]);
    const onComplete = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue, cam]} onComplete={onComplete} nexus2Installed />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('conflicts.onboarding.uninstallNexus2')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.resolveAll' }));
    });

    expect(mockKill.mock.calls.map(c => c[0]).sort()).toEqual(['icue', 'nzxt-cam']);
    expect(mockDisableAutostart).toHaveBeenCalledWith('icue');
    expect(mockUninstall).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('resolve all leaves Nexus 2 alone unless it is installed', async () => {
    const onComplete = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue]} onComplete={onComplete} />);
    expect(screen.queryByText('conflicts.onboarding.uninstallNexus2')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.resolveAll' }));
    });

    expect(mockUninstall).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows the all-clear state with the uninstall card for an installed, idle Nexus 2', () => {
    render(<ConflictOnboardingScreen open ready conflicts={[]} onComplete={() => {}} nexus2Installed />);

    expect(screen.getByText('conflicts.modal.empty')).toBeInTheDocument();
    expect(screen.getByText('conflicts.onboarding.uninstallNexus2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.modal.resolveAll' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conflicts.onboarding.skip' })).toBeInTheDocument();
  });

  it('resolve all skips a whitelisted app: no kill, no autostart disable', async () => {
    mockExclusions = ['icue'];
    mockFetchAutostart.mockResolvedValue([{ id: 'icue', entries: [{ kind: 'service', entryName: 'CorsairService' }] }]);
    const onComplete = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue, cam]} onComplete={onComplete} />);
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.resolveAll' }));
    });

    expect(mockKill).toHaveBeenCalledWith('nzxt-cam');
    expect(mockKill).not.toHaveBeenCalledWith('icue');
    expect(mockDisableAutostart).not.toHaveBeenCalledWith('icue');
    expect(onComplete).toHaveBeenCalledTimes(1);
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

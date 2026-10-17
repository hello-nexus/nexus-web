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
const mockWhitelist = vi.fn();
const mockDisableAutostart = vi.fn();
const mockFetchAutostart = vi.fn();
vi.mock('../../../api/conflicts', () => ({
  HYTE_NEXUS2_CONFLICT_ID: 'hyte-nexus-2',
  killConflict: (...args: any[]) => mockKill(...args),
  setConflictWhitelisted: (...args: any[]) => mockWhitelist(...args),
  fetchConflictAutostart: (...args: any[]) => mockFetchAutostart(...args),
  disableConflictAutostart: (...args: any[]) => mockDisableAutostart(...args),
}));

const mockUninstall = vi.fn();
vi.mock('../../../api/migration', () => ({
  uninstallNexus2: (...args: any[]) => mockUninstall(...args),
}));

const mockReportStep = vi.fn();
vi.mock('../../../api/onboarding', () => ({
  reportConflictStep: (...args: any[]) => mockReportStep(...args),
}));

let mockExclusions: string[] = [];
vi.mock('../../../hooks/useUiSettings', () => ({
  useConflictAutoKillExclusions: () => mockExclusions,
}));

beforeEach(() => {
  mockKill.mockReset();
  mockKill.mockResolvedValue({ error: false, msg: 'Ok', killed: true });
  mockWhitelist.mockReset();
  mockWhitelist.mockResolvedValue({ error: false, msg: 'Ok' });
  mockDisableAutostart.mockReset();
  mockDisableAutostart.mockResolvedValue({ error: false, msg: 'Ok', disabled: 1 });
  // The boot-entry read has its own tests; here it only has to resolve so the
  // screen renders without an unhandled rejection.
  mockFetchAutostart.mockReset();
  mockFetchAutostart.mockResolvedValue([]);
  mockUninstall.mockReset();
  mockUninstall.mockResolvedValue({ error: false, msg: 'Ok' });
  mockReportStep.mockReset();
  mockReportStep.mockResolvedValue(null);
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


  it('ends nothing on mount, and Keep all running allows every app without ending any', async () => {
    const onComplete = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue, cam]} onComplete={onComplete} nexus2Installed />);
    expect(mockKill).not.toHaveBeenCalled();
    expect(mockWhitelist).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.outcome.keepAll' }));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mockKill).not.toHaveBeenCalled();
    expect(mockUninstall).not.toHaveBeenCalled();
    expect(mockWhitelist.mock.calls.map(c => c[0]).sort()).toEqual(['icue', 'nzxt-cam']);
    expect(mockReportStep).toHaveBeenCalledWith({
      action: 'skip', listed: ['icue', 'nzxt-cam'], whitelisted: [], alreadyEnded: [],
    });
  });

  it('the primary button ends every app, removes ticked boot entries, uninstalls Nexus 2, then completes', async () => {
    mockFetchAutostart.mockResolvedValue([{ id: 'icue', entries: [{ kind: 'service', entryName: 'CorsairService' }] }]);
    const onComplete = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue, cam]} onComplete={onComplete} nexus2Installed />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('HYTE Nexus 2')).toBeInTheDocument();
    expect(screen.getByText('conflicts.outcome.willUninstall')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.outcome.terminateContinue:2' }));
    });

    expect(mockKill.mock.calls.map(c => c[0]).sort()).toEqual(['icue', 'nzxt-cam']);
    expect(mockDisableAutostart).toHaveBeenCalledWith('icue');
    expect(mockUninstall).toHaveBeenCalledTimes(1);
    expect(mockWhitelist).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mockReportStep).toHaveBeenCalledWith({
      action: 'resolveAll', listed: ['icue', 'nzxt-cam'], whitelisted: [], alreadyEnded: [],
    });
  });

  it('keeps Nexus 2 installed when its card is unselected, and never allow-lists it', async () => {
    const onComplete = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue]} onComplete={onComplete} nexus2Installed />);

    fireEvent.click(screen.getByText('conflicts.outcome.willUninstall'));
    expect(screen.getByText('conflicts.outcome.staysInstalled')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.outcome.terminateContinueOne' }));
    });

    expect(mockUninstall).not.toHaveBeenCalled();
    expect(mockWhitelist).not.toHaveBeenCalledWith('hyte-nexus-2', expect.anything());
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ends a running Nexus 2 even when it is on the allowed list', async () => {
    mockExclusions = ['hyte-nexus-2'];
    const nexus2 = { id: 'hyte-nexus-2', displayName: 'HYTE Nexus 2', category: 'lighting', processName: 'HYTE Nexus', pid: 3268 };
    render(<ConflictOnboardingScreen open ready conflicts={[nexus2]} onComplete={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.outcome.terminateContinueOne' }));
    });

    expect(mockKill).toHaveBeenCalledWith('hyte-nexus-2');
    expect(mockWhitelist).not.toHaveBeenCalled();
  });

  it('offers no uninstall card unless Nexus 2 is installed', () => {
    render(<ConflictOnboardingScreen open ready conflicts={[icue]} onComplete={() => {}} />);

    expect(screen.queryByText('conflicts.outcome.willUninstall')).not.toBeInTheDocument();
  });

  it('shows the all-clear state without footer buttons when nothing is detected and Nexus 2 is absent', () => {
    render(<ConflictOnboardingScreen open ready conflicts={[]} onComplete={() => {}} />);

    expect(screen.getByText('conflicts.modal.empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'conflicts.outcome.keepAll' })).not.toBeInTheDocument();
  });

  it('an allowed app keeps running by default: not ended, boot entries untouched', async () => {
    mockExclusions = ['icue'];
    mockFetchAutostart.mockResolvedValue([{ id: 'icue', entries: [{ kind: 'service', entryName: 'CorsairService' }] }]);
    const onComplete = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue, cam]} onComplete={onComplete} />);
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.outcome.terminateContinueOne' }));
    });

    expect(mockKill).toHaveBeenCalledWith('nzxt-cam');
    expect(mockKill).not.toHaveBeenCalledWith('icue');
    expect(mockDisableAutostart).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(mockReportStep).toHaveBeenCalledWith({
      action: 'resolveAll', listed: ['icue', 'nzxt-cam'], whitelisted: ['icue'], alreadyEnded: [],
    });
  });

  it('Enter does not trigger the primary action', () => {
    render(<ConflictOnboardingScreen open ready conflicts={[icue]} onComplete={() => {}} />);

    fireEvent.keyDown(document.body, { key: 'Enter' });

    expect(mockKill).not.toHaveBeenCalled();
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

  it('reports skip onboarding before handing off', () => {
    const onSkipOnboarding = vi.fn();
    render(<ConflictOnboardingScreen open ready conflicts={[icue]} onComplete={() => {}} onSkipOnboarding={onSkipOnboarding} />);

    fireEvent.click(screen.getByRole('button', { name: 'onboarding.skip' }));

    expect(onSkipOnboarding).toHaveBeenCalledTimes(1);
    expect(mockReportStep).toHaveBeenCalledWith({
      action: 'skipOnboarding', listed: ['icue'], whitelisted: [], alreadyEnded: [],
    });
  });
});

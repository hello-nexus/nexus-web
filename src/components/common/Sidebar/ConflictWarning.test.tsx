import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictWarningBadge } from './ConflictWarning';
import type { DetectedConflict } from '../../../api/conflicts';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join('|')}` : key),
  }),
}));

let mockExclusions: string[] = [];
vi.mock('../../../hooks/useUiSettings', () => ({
  useConflictAutoKillExclusions: () => mockExclusions,
}));

vi.mock('../../../api/conflicts', async () => {
  const actual = await vi.importActual<any>('../../../api/conflicts');
  return { ...actual, killConflict: vi.fn() };
});

// The device join is covered by useConflictDevices' own tests; here the modal
// only needs the card rows.
vi.mock('../../../hooks/useConflictDevices', () => ({
  useConflictDevices: () => ({ devicesByApp: new Map(), setOwner: vi.fn() }),
}));

const conflicts: DetectedConflict[] = [
  { id: 'icue', displayName: 'iCUE', category: 'cooling', processName: 'iCUE.exe', pid: 42 },
  { id: 'lian-li-l-connect', displayName: 'L-Connect', category: 'lighting', processName: 'LConnect.exe', pid: 7 },
];

describe('ConflictWarningModal', () => {
  beforeEach(() => {
    mockExclusions = [];
  });

  it('renders one ConflictAppCard per detected conflict', () => {
    render(
      <ConflictWarningBadge
        conflicts={conflicts}
        ready
        suppressed={false}
        open
        onOpenChange={vi.fn()}
        onSuppressedChange={vi.fn()}
        onManageApps={vi.fn()}
      />,
    );

    expect(screen.getByText('iCUE')).toBeInTheDocument();
    expect(screen.getByText('conflicts.modal.pid:42')).toBeInTheDocument();
    expect(screen.getByText('L-Connect')).toBeInTheDocument();
    expect(screen.getByText('conflicts.modal.pid:7')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'conflicts.modal.endTask' })).toHaveLength(2);
  });

  it('renders the empty state when there are no conflicts', () => {
    render(
      <ConflictWarningBadge
        conflicts={[]}
        ready
        suppressed={false}
        open
        onOpenChange={vi.fn()}
        onSuppressedChange={vi.fn()}
        onManageApps={vi.fn()}
      />,
    );

    expect(screen.getByText('conflicts.modal.empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'conflicts.modal.endTask' })).not.toBeInTheDocument();
  });

  it('Manage apps closes the modal and opens the settings manager', () => {
    const onOpenChange = vi.fn();
    const onManageApps = vi.fn();
    render(
      <ConflictWarningBadge
        conflicts={conflicts}
        ready
        suppressed={false}
        open
        onOpenChange={onOpenChange}
        onSuppressedChange={vi.fn()}
        onManageApps={onManageApps}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.manageApps' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onManageApps).toHaveBeenCalledTimes(1);
  });

  it('hides the badge once every detected app is whitelisted, but keeps listing it in an open modal', () => {
    mockExclusions = ['icue', 'lian-li-l-connect'];
    render(
      <ConflictWarningBadge
        conflicts={conflicts}
        ready
        suppressed={false}
        open
        onOpenChange={vi.fn()}
        onSuppressedChange={vi.fn()}
        onManageApps={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'conflicts.badge.text' })).not.toBeInTheDocument();
    expect(screen.getByText('iCUE')).toBeInTheDocument();
    expect(screen.getByText('L-Connect')).toBeInTheDocument();
  });

  it('shows the badge while at least one detected app is not whitelisted', () => {
    mockExclusions = ['icue'];
    render(
      <ConflictWarningBadge
        conflicts={conflicts}
        ready
        suppressed={false}
        open={false}
        onOpenChange={vi.fn()}
        onSuppressedChange={vi.fn()}
        onManageApps={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'conflicts.badge.text' })).toBeInTheDocument();
  });
});

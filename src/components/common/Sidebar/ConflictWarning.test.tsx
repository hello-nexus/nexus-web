import { render, screen } from '@testing-library/react';
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

let mockOverlaps: (c: DetectedConflict) => boolean = () => true;
vi.mock('../../../hooks/useConflictOverlap', async () => {
  const actual = await vi.importActual<any>('../../../hooks/useConflictOverlap');
  return { ...actual, useConflictOverlap: () => (c: DetectedConflict) => mockOverlaps(c) };
});

const conflicts: DetectedConflict[] = [
  { id: 'icue', displayName: 'iCUE', category: 'cooling', processName: 'iCUE.exe', pid: 42 },
  { id: 'lian-li-l-connect', displayName: 'L-Connect', category: 'lighting', processName: 'LConnect.exe', pid: 7 },
];

describe('ConflictWarningModal', () => {
  beforeEach(() => {
    mockExclusions = [];
    mockOverlaps = () => true;
  });

  it('renders one outcome card per detected conflict', () => {
    render(
      <ConflictWarningBadge
        conflicts={conflicts}
        ready
        suppressed={false}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText('iCUE')).toBeInTheDocument();
    expect(screen.getByText('conflicts.modal.pid:42')).toBeInTheDocument();
    expect(screen.getByText('L-Connect')).toBeInTheDocument();
    expect(screen.getByText('conflicts.modal.pid:7')).toBeInTheDocument();
    expect(screen.getAllByText('conflicts.outcome.willTerminate')).toHaveLength(2);
  });

  it('renders the empty state when there are no conflicts', () => {
    render(
      <ConflictWarningBadge
        conflicts={[]}
        ready
        suppressed={false}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText('conflicts.modal.empty')).toBeInTheDocument();
    expect(screen.queryByText('conflicts.outcome.willTerminate')).not.toBeInTheDocument();
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
      />,
    );

    expect(screen.getByRole('button', { name: 'conflicts.badge.text' })).toBeInTheDocument();
  });

  it('hides the badge while no detected app shares a device with Nexus, but keeps listing it in an open modal', () => {
    mockOverlaps = () => false;
    render(
      <ConflictWarningBadge
        conflicts={conflicts}
        ready
        suppressed={false}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'conflicts.badge.text' })).not.toBeInTheDocument();
    expect(screen.getByText('iCUE')).toBeInTheDocument();
  });

  it('shows the badge when one non-whitelisted app overlaps and the others do not', () => {
    mockExclusions = ['icue'];
    mockOverlaps = c => c.id === 'lian-li-l-connect';
    render(
      <ConflictWarningBadge
        conflicts={conflicts}
        ready
        suppressed={false}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'conflicts.badge.text' })).toBeInTheDocument();
  });

  it('hides the badge when the only overlapping app is whitelisted', () => {
    mockExclusions = ['icue'];
    mockOverlaps = c => c.id === 'icue';
    render(
      <ConflictWarningBadge
        conflicts={conflicts}
        ready
        suppressed={false}
        open={false}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'conflicts.badge.text' })).not.toBeInTheDocument();
  });
});

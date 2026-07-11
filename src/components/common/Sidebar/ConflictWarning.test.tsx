import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConflictWarningBadge } from './ConflictWarning';
import type { DetectedConflict } from '../../../api/conflicts';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../api/conflicts', async () => {
  const actual = await vi.importActual<any>('../../../api/conflicts');
  return { ...actual, killConflict: vi.fn() };
});

const conflicts: DetectedConflict[] = [
  { id: 'icue', displayName: 'iCUE', category: 'cooling', processName: 'iCUE.exe', pid: 42 },
  { id: 'lian-li-l-connect', displayName: 'L-Connect', category: 'lighting', processName: 'LConnect.exe', pid: 7 },
];

describe('ConflictWarningModal', () => {
  it('renders one ConflictAppCard per detected conflict', () => {
    render(
      <ConflictWarningBadge
        conflicts={conflicts}
        pulsing={false}
        suppressed={false}
        open
        onOpenChange={vi.fn()}
        onSuppressedChange={vi.fn()}
      />,
    );

    expect(screen.getByText('iCUE')).toBeInTheDocument();
    expect(screen.getByText('PID 42')).toBeInTheDocument();
    expect(screen.getByText('L-Connect')).toBeInTheDocument();
    expect(screen.getByText('PID 7')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'conflicts.modal.endTask' })).toHaveLength(2);
  });

  it('renders the empty state when there are no conflicts', () => {
    render(
      <ConflictWarningBadge
        conflicts={[]}
        pulsing={false}
        suppressed={false}
        open
        onOpenChange={vi.fn()}
        onSuppressedChange={vi.fn()}
      />,
    );

    expect(screen.getByText('conflicts.modal.empty')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'conflicts.modal.endTask' })).not.toBeInTheDocument();
  });
});

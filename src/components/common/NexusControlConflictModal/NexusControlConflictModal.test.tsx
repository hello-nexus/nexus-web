import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedConflict } from '../../../api/conflicts';
import type { ConflictAppsState } from '../../../hooks/useConflictApps';
import type { PendingControlEnable } from '../../../hooks/useConflictGuardedEnable';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));
vi.mock('../../../api/conflicts', () => ({ killConflict: vi.fn() }));
let mockState: ConflictAppsState = { conflicts: [], ready: false };
vi.mock('../../../hooks/useConflictApps', () => ({
  useConflictApps: () => mockState,
}));

import { NexusControlConflictModal } from './NexusControlConflictModal';

const APP: DetectedConflict = { id: 'icue', displayName: 'Corsair iCUE', category: 'lighting', processName: 'iCUE.exe', pid: 10 };
const PENDING: PendingControlEnable = { deviceName: 'Commander Core', conflict: APP, enable: () => {} };

beforeEach(() => {
  mockState = { conflicts: [], ready: false };
});

describe('NexusControlConflictModal', () => {
  it('renders nothing without a held enable', () => {
    render(<NexusControlConflictModal pending={null} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText(/devices\.conflictEnable\.title/)).toBeNull();
  });

  it('confirms once the app it saw running drops out of the live list', () => {
    const onConfirm = vi.fn();
    mockState = { conflicts: [APP], ready: true };
    const { rerender } = render(<NexusControlConflictModal pending={PENDING} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(onConfirm).not.toHaveBeenCalled();

    mockState = { conflicts: [], ready: true };
    rerender(<NexusControlConflictModal pending={PENDING} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not confirm on a first snapshot that never listed the app', () => {
    const onConfirm = vi.fn();
    mockState = { conflicts: [], ready: true };
    render(<NexusControlConflictModal pending={PENDING} onConfirm={onConfirm} onCancel={vi.fn()} />);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/devices\.conflictEnable\.title/)).toBeInTheDocument();
  });

  it('shows the live row so a respawned pid reaches the card', () => {
    mockState = { conflicts: [{ ...APP, pid: 99 }], ready: true };
    render(<NexusControlConflictModal pending={PENDING} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('conflicts.modal.pid:{"pid":99}')).toBeInTheDocument();
  });
});

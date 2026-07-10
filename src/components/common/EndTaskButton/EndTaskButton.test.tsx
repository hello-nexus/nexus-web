import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EndTaskButton } from './EndTaskButton';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockKillConflict = vi.fn();

vi.mock('../../../api/conflicts', () => ({
  killConflict: (...args: any[]) => mockKillConflict(...args),
}));

beforeEach(() => {
  mockKillConflict.mockReset();
});

describe('EndTaskButton', () => {
  it('calls killConflict with the conflict id on click', async () => {
    mockKillConflict.mockResolvedValue({ killed: true });
    render(<EndTaskButton conflictId="icue" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'conflicts.modal.endTask' }));
    });

    expect(mockKillConflict).toHaveBeenCalledWith('icue');
  });

  it('shows the loading state while the kill is in flight', async () => {
    let resolveKill: (value: { killed: boolean }) => void = () => {};
    mockKillConflict.mockReturnValue(new Promise(resolve => { resolveKill = resolve; }));
    render(<EndTaskButton conflictId="icue" />);

    const button = screen.getByRole('button', { name: 'conflicts.modal.endTask' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('data-loading', 'true');

    await act(async () => {
      resolveKill({ killed: true });
    });
  });

  it('resets the loading state on failure so the user can retry', async () => {
    mockKillConflict.mockResolvedValue({ killed: false });
    render(<EndTaskButton conflictId="icue" />);
    const button = screen.getByRole('button', { name: 'conflicts.modal.endTask' });

    await act(async () => {
      fireEvent.click(button);
    });

    expect(button).not.toHaveAttribute('data-loading');
  });
});

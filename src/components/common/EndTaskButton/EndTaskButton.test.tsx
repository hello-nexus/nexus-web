import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EndTaskButton } from './EndTaskButton';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockKill = vi.fn();

vi.mock('../../../api/conflicts', () => ({
  killConflict: (...args: any[]) => mockKill(...args),
}));

beforeEach(() => {
  mockKill.mockReset();
});

// loadingHidesLabel keeps the label in the DOM to hold the width, so the
// loading state reads off Button's data-loading attribute instead.
const spinning = () => screen.getByRole('button').hasAttribute('data-loading');

async function clickEnd() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button'));
  });
}

describe('EndTaskButton', () => {
  it('kills by catalog id and keeps spinning while the row stands', async () => {
    mockKill.mockResolvedValue({ error: false, msg: 'Killed', killed: true });
    render(<EndTaskButton conflictId="signalrgb" pid={100} />);

    await clickEnd();

    expect(mockKill).toHaveBeenCalledWith('signalrgb');
    expect(spinning()).toBe(true);
  });

  it('stops spinning once the app comes back under a new pid', async () => {
    // An Automatic service the SCM restarts keeps the row - and its React key -
    // so the spinner would otherwise never clear.
    mockKill.mockResolvedValue({ error: false, msg: 'Killed', killed: true });
    const { rerender } = render(<EndTaskButton conflictId="signalrgb" pid={100} />);

    await clickEnd();
    expect(spinning()).toBe(true);

    await act(async () => { rerender(<EndTaskButton conflictId="signalrgb" pid={412} />); });

    expect(spinning()).toBe(false);
  });

  it('keeps spinning while the pid is unchanged', async () => {
    mockKill.mockResolvedValue({ error: false, msg: 'Killed', killed: true });
    const { rerender } = render(<EndTaskButton conflictId="signalrgb" pid={100} />);

    await clickEnd();
    await act(async () => { rerender(<EndTaskButton conflictId="signalrgb" pid={100} />); });

    expect(spinning()).toBe(true);
  });

  it('resets when nothing was killed so the user can retry', async () => {
    mockKill.mockResolvedValue({ error: false, msg: 'No matching process', killed: false });
    render(<EndTaskButton conflictId="signalrgb" pid={100} />);

    await clickEnd();

    expect(spinning()).toBe(false);
  });

  it('resets when the request throws', async () => {
    mockKill.mockRejectedValue(new Error('offline'));
    render(<EndTaskButton conflictId="signalrgb" pid={100} />);

    await clickEnd();

    expect(spinning()).toBe(false);
  });

  it('never fires on mount', () => {
    render(<EndTaskButton conflictId="signalrgb" pid={100} />);
    expect(mockKill).not.toHaveBeenCalled();
  });

  it('spins as though pressed while another control runs the same kill', () => {
    render(<EndTaskButton conflictId="signalrgb" pid={100} busy />);
    expect(spinning()).toBe(true);
  });

  it('renders the terminated marker in place of the button once the app is ended', () => {
    render(<EndTaskButton conflictId="signalrgb" pid={100} terminated />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('conflicts.modal.terminated')).toBeInTheDocument();
  });

  it('hands a stuck kill to the caller and stops spinning, since the row now stays', async () => {
    mockKill.mockResolvedValue({ error: false, msg: 'Killed', killed: true });
    const onKilled = vi.fn();
    render(<EndTaskButton conflictId="signalrgb" pid={100} onKilled={onKilled} />);

    await clickEnd();

    expect(onKilled).toHaveBeenCalledTimes(1);
    expect(spinning()).toBe(false);
  });

  it('does not report a kill that did not stick', async () => {
    mockKill.mockResolvedValue({ error: false, msg: 'Still running', killed: false });
    const onKilled = vi.fn();
    render(<EndTaskButton conflictId="signalrgb" pid={100} onKilled={onKilled} />);

    await clickEnd();

    expect(onKilled).not.toHaveBeenCalled();
    expect(spinning()).toBe(false);
  });
});

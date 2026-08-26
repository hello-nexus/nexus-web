import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveFromStartupButton } from './RemoveFromStartupButton';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      (params ? `${key}:${Object.values(params).join('|')}` : key),
  }),
}));

const mockDisable = vi.fn();

vi.mock('../../../api/conflicts', () => ({
  disableConflictAutostart: (...args: any[]) => mockDisable(...args),
}));

beforeEach(() => {
  mockDisable.mockReset();
});

const runEntry = { kind: 'runKeyMachine', entryName: 'Corsair iCUE5 Software' };
const serviceEntry = { kind: 'service', entryName: 'CorsairDeviceListerService' };

async function clickRemove() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button'));
  });
}

describe('RemoveFromStartupButton', () => {
  it('sends one request for the app and latches once every entry was removed', async () => {
    mockDisable.mockResolvedValue({ error: false, msg: 'Ok', removed: 2 });
    render(<RemoveFromStartupButton conflictId="icue" entries={[serviceEntry, runEntry]} />);

    await clickRemove();

    expect(mockDisable).toHaveBeenCalledWith('icue');
    expect(screen.getByText('conflicts.modal.startupRemoved')).toBeInTheDocument();
  });

  it('stays actionable when only some entries were removed', async () => {
    // The app still starts with Windows, so a latched done state would lie.
    mockDisable.mockResolvedValue({ error: true, msg: 'removed 1 of 2', removed: 1 });
    render(<RemoveFromStartupButton conflictId="icue" entries={[serviceEntry, runEntry]} />);

    await clickRemove();

    expect(screen.queryByText('conflicts.modal.startupRemoved')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('stays actionable when the request produced no body', async () => {
    mockDisable.mockResolvedValue(null);
    render(<RemoveFromStartupButton conflictId="icue" entries={[runEntry]} />);

    await clickRemove();

    expect(screen.queryByText('conflicts.modal.startupRemoved')).not.toBeInTheDocument();
  });

  it('reads as a service only when every entry is one', () => {
    const { unmount } = render(<RemoveFromStartupButton conflictId="cam" entries={[serviceEntry]} />);
    expect(screen.getByRole('button')).toHaveTextContent('conflicts.modal.removeStartupService');
    unmount();

    render(<RemoveFromStartupButton conflictId="icue" entries={[serviceEntry, runEntry]} />);
    expect(screen.getByRole('button')).toHaveTextContent('conflicts.modal.removeStartup');
  });

  it('names every entry it will remove', () => {
    // Button routes `title` through HoverTooltip rather than the DOM attribute,
    // and focus opens it with no pointer-rest delay.
    render(<RemoveFromStartupButton conflictId="icue" entries={[serviceEntry, runEntry]} />);
    fireEvent.focus(screen.getByRole('button'));

    expect(screen.getByText(
      'conflicts.modal.removeStartupEntry:CorsairDeviceListerService, Corsair iCUE5 Software',
    )).toBeInTheDocument();
  });

  it('never fires anything on mount', () => {
    render(<RemoveFromStartupButton conflictId="icue" entries={[runEntry]} />);

    expect(mockDisable).not.toHaveBeenCalled();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openRecoveryMock = vi.fn();
const linkRecoveryLocallyMock = vi.fn();
vi.mock('../../api/account', () => ({
  openRecovery: (...args: unknown[]) => openRecoveryMock(...args),
}));
vi.mock('./linkRecoveryLocally', () => ({
  linkRecoveryLocally: (...args: unknown[]) => linkRecoveryLocallyMock(...args),
}));

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { RecoverPage } from './RecoverPage';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  openRecoveryMock.mockReset();
  linkRecoveryLocallyMock.mockReset();
  linkRecoveryLocallyMock.mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

async function expectSignedIn() {
  await waitFor(() => expect(screen.getByText('auth.recover.success.title')).toBeInTheDocument());
  await act(async () => { vi.advanceTimersByTime(1200); });
  expect(screen.getByText('auth.recover.success.body')).toBeInTheDocument();
}

describe('RecoverPage', () => {
  it('shows the invalid state immediately when no token is present, without calling the API', () => {
    render(<RecoverPage token="" />);
    expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument();
    expect(openRecoveryMock).not.toHaveBeenCalled();
    expect(linkRecoveryLocallyMock).not.toHaveBeenCalled();
  });

  it('shows the code to type on the device that asked', async () => {
    openRecoveryMock.mockResolvedValue({ status: 'code', code: '482-915' });
    render(<RecoverPage token="tok" />);

    await waitFor(() => expect(screen.getByText('482-915')).toBeInTheDocument());
    expect(screen.getByText('auth.recover.code.body')).toBeInTheDocument();
    expect(openRecoveryMock).toHaveBeenCalledWith('tok');
    await waitFor(() => expect(linkRecoveryLocallyMock).toHaveBeenCalledWith('tok'));
  });

  it('signs in with no code in the browser that asked', async () => {
    openRecoveryMock.mockResolvedValue({ status: 'approved' });
    render(<RecoverPage token="tok" />);
    await expectSignedIn();
  });

  it('switches from the code to signed in once the Nexus on this computer takes the link', async () => {
    openRecoveryMock.mockResolvedValue({ status: 'code', code: '482-915' });
    let finishLink: (ok: boolean) => void = () => {};
    linkRecoveryLocallyMock.mockReturnValue(new Promise<boolean>((resolve) => { finishLink = resolve; }));
    render(<RecoverPage token="tok" />);
    await waitFor(() => expect(screen.getByText('482-915')).toBeInTheDocument());

    await act(async () => { finishLink(true); });

    await expectSignedIn();
  });

  it('never reaches for the local service unless the page ended on a code', async () => {
    openRecoveryMock.mockResolvedValue({ status: 'approved' });
    render(<RecoverPage token="tok" />);
    await expectSignedIn();
    expect(linkRecoveryLocallyMock).not.toHaveBeenCalled();
  });

  it('does not try the local service from a phone', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148');
    openRecoveryMock.mockResolvedValue({ status: 'code', code: '482-915' });
    render(<RecoverPage token="tok" />);
    await waitFor(() => expect(screen.getByText('482-915')).toBeInTheDocument());
    expect(linkRecoveryLocallyMock).not.toHaveBeenCalled();
    ua.mockRestore();
  });

  it('shows the invalid card for a dead link', async () => {
    openRecoveryMock.mockResolvedValue({ status: 'invalid' });
    render(<RecoverPage token="tok" />);
    await waitFor(() => expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument());
  });

  it('offers a retry when the request itself failed', async () => {
    openRecoveryMock.mockResolvedValueOnce({ status: 'error' }).mockResolvedValueOnce({ status: 'code', code: '111-222' });
    render(<RecoverPage token="tok" />);
    await waitFor(() => expect(screen.getByText('auth.recover.error.title')).toBeInTheDocument());

    fireEvent.click(screen.getByText('account.recovery.tryAgain'));

    await waitFor(() => expect(screen.getByText('111-222')).toBeInTheDocument());
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const completeRecoveryMock = vi.fn();
vi.mock('../../api/account', () => ({
  completeRecovery: (...args: unknown[]) => completeRecoveryMock(...args),
}));

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

import { RecoverPage } from './RecoverPage';

beforeEach(() => {
  completeRecoveryMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('RecoverPage', () => {
  it('shows the invalid state immediately when no token is present, without calling the API', () => {
    render(<RecoverPage token="" />);

    expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument();
    expect(completeRecoveryMock).not.toHaveBeenCalled();
  });

  it('shows the success state with the returned username interpolated', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: true, username: 'Nova' });
    render(<RecoverPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.recover.success.title')).toBeInTheDocument());
    expect(screen.getByText('auth.recover.success.body username=Nova')).toBeInTheDocument();
  });

  it('shows the invalid state when the server reports ok: false', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: false });
    render(<RecoverPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument());
  });

  it('asks for the code when the grant was started with one, then completes with it', async () => {
    completeRecoveryMock
      .mockResolvedValueOnce({ ok: false, reason: 'code-required' })
      .mockResolvedValueOnce({ ok: true, username: 'Nova' });
    render(<RecoverPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.recover.code.title')).toBeInTheDocument());
    fireEvent.input(screen.getByLabelText('auth.recover.code.label'), { target: { value: 'ABC-DEF' } });
    fireEvent.click(screen.getByText('auth.recover.code.submit'));

    await waitFor(() => expect(screen.getByText('auth.recover.success.title')).toBeInTheDocument());
    expect(completeRecoveryMock).toHaveBeenLastCalledWith('tok', 'ABC-DEF');
  });

  it('keeps the form up and reports the remaining attempts on a wrong code', async () => {
    completeRecoveryMock
      .mockResolvedValueOnce({ ok: false, reason: 'code-required' })
      .mockResolvedValueOnce({ ok: false, reason: 'code-mismatch', attemptsLeft: 3 });
    render(<RecoverPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.recover.code.title')).toBeInTheDocument());
    fireEvent.input(screen.getByLabelText('auth.recover.code.label'), { target: { value: 'WRONGX' } });
    fireEvent.click(screen.getByText('auth.recover.code.submit'));

    await waitFor(() => expect(screen.getByText('auth.recover.code.wrong count=3')).toBeInTheDocument());
    expect(screen.getByText('auth.recover.code.title')).toBeInTheDocument();
  });

  it('shows the exhausted card once the guesses are spent', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: false, reason: 'code-exhausted' });
    render(<RecoverPage token="tok" />);

    await waitFor(() =>
      expect(screen.getByText('auth.recover.code.exhaustedTitle')).toBeInTheDocument(),
    );
  });

  it('treats an ok: true response missing a username as invalid', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: true });
    render(<RecoverPage token="tok" />);

    await waitFor(() => expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument());
  });
});

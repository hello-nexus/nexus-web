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

const submitCode = (value: string) => {
  fireEvent.input(screen.getByLabelText('auth.recover.code.label'), { target: { value } });
  fireEvent.click(screen.getByText('auth.recover.code.submit'));
};

describe('RecoverPage', () => {
  it('shows the invalid state immediately when no token is present, without calling the API', () => {
    render(<RecoverPage token="" />);

    expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument();
    expect(completeRecoveryMock).not.toHaveBeenCalled();
  });

  it('opens on the code form and completes nothing on its own', () => {
    render(<RecoverPage token="tok" />);

    expect(screen.getByText('auth.recover.code.title')).toBeInTheDocument();
    expect(completeRecoveryMock).not.toHaveBeenCalled();
  });

  it('signs in with the code and shows the returned username', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: true, username: 'Nova' });
    render(<RecoverPage token="tok" />);

    submitCode('ABC-DEF');

    await waitFor(() => expect(screen.getByText('auth.recover.success.title')).toBeInTheDocument());
    expect(screen.getByText('auth.recover.success.body username=Nova')).toBeInTheDocument();
    // The dash is presentation; the api gets the code as minted.
    expect(completeRecoveryMock).toHaveBeenLastCalledWith('tok', 'ABCDEF');
  });

  it('groups the code as it is shown on the other device, and holds submit until it is whole', () => {
    render(<RecoverPage token="tok" />);
    const field = screen.getByLabelText('auth.recover.code.label') as HTMLInputElement;

    fireEvent.input(field, { target: { value: 'abc' } });
    expect(field.value).toBe('ABC');
    expect(screen.getByText('auth.recover.code.submit').closest('button')).toBeDisabled();

    fireEvent.input(field, { target: { value: 'abcd' } });
    expect(field.value).toBe('ABC-D');

    fireEvent.input(field, { target: { value: 'abc-def!!extra' } });
    expect(field.value).toBe('ABC-DEF');
    expect(screen.getByText('auth.recover.code.submit').closest('button')).not.toBeDisabled();
  });

  it('keeps the form up and reports the remaining attempts on a wrong code', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: false, reason: 'code-mismatch', attemptsLeft: 3 });
    render(<RecoverPage token="tok" />);

    submitCode('WRONGX');

    await waitFor(() => expect(screen.getByText('auth.recover.code.wrong count=3')).toBeInTheDocument());
    expect(screen.getByText('auth.recover.code.title')).toBeInTheDocument();
  });

  it('shows the exhausted card once the guesses are spent', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: false, reason: 'code-exhausted' });
    render(<RecoverPage token="tok" />);

    submitCode('WRONGX');

    await waitFor(() =>
      expect(screen.getByText('auth.recover.code.exhaustedTitle')).toBeInTheDocument(),
    );
  });

  it('shows the invalid card for a dead link', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: false, reason: 'invalid' });
    render(<RecoverPage token="tok" />);

    submitCode('ABCDEF');

    await waitFor(() => expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument());
  });
});

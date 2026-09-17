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
  // The field submits itself, so every test that fills it makes a call -
  // including the ones only asserting what the field holds.
  completeRecoveryMock.mockResolvedValue({ ok: false, reason: 'invalid' });
});

afterEach(() => {
  vi.clearAllMocks();
});

const field = () => screen.getByLabelText('auth.recover.code.label') as HTMLInputElement;
const type = (value: string) => fireEvent.input(field(), { target: { value } });

describe('RecoverPage', () => {
  it('shows the invalid state immediately when no token is present, without calling the API', () => {
    render(<RecoverPage token="" />);

    expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument();
    expect(completeRecoveryMock).not.toHaveBeenCalled();
  });

  it('opens on the code field and posts nothing on its own', () => {
    render(<RecoverPage token="tok" />);

    expect(screen.getByText('auth.recover.code.title')).toBeInTheDocument();
    expect(completeRecoveryMock).not.toHaveBeenCalled();
  });

  it('keeps only the characters a code is made of, and submits on the last one', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: true, username: 'Nova' });
    render(<RecoverPage token="tok" />);

    type('abc');
    expect(field().value).toBe('ABC');
    expect(completeRecoveryMock).not.toHaveBeenCalled();

    // The dash the other device shows, and anything else pasted with it, is
    // dropped rather than refused.
    type('abc-de f!x');
    await waitFor(() => expect(completeRecoveryMock).toHaveBeenCalledWith('tok', 'ABCDEF'));
    await waitFor(() => expect(screen.getByText('auth.recover.success.title')).toBeInTheDocument());
  });

  it('never holds more than a whole code', () => {
    render(<RecoverPage token="tok" />);
    type('abcdefghij');
    expect(field().value).toBe('ABCDEF');
  });

  it('clears the field and reports the remaining attempts on a wrong code', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: false, reason: 'code-mismatch', attemptsLeft: 3 });
    render(<RecoverPage token="tok" />);

    type('zzzzzz');

    await waitFor(() => expect(screen.getByText('auth.recover.code.wrong count=3')).toBeInTheDocument());
    expect(field().value).toBe('');
    expect(screen.getByText('auth.recover.code.title')).toBeInTheDocument();
  });

  it('offers a way back to the field when the link is refused', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: false, reason: 'invalid' });
    render(<RecoverPage token="tok" />);

    type('abcdef');
    await waitFor(() => expect(screen.getByText('auth.recover.invalid.title')).toBeInTheDocument());

    fireEvent.click(screen.getByText('account.recovery.tryAgain'));
    expect(screen.getByText('auth.recover.code.title')).toBeInTheDocument();
    expect(field().value).toBe('');
  });

  it('shows the exhausted card once the guesses are spent', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: false, reason: 'code-exhausted' });
    render(<RecoverPage token="tok" />);

    type('abcdef');
    await waitFor(() =>
      expect(screen.getByText('auth.recover.code.exhaustedTitle')).toBeInTheDocument(),
    );
  });
});

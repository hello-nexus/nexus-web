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

  it('groups the code as it is typed, and submits on the last character', async () => {
    completeRecoveryMock.mockResolvedValue({ ok: true, username: 'Nova' });
    render(<RecoverPage token="tok" />);

    type('abc');
    expect(field().value).toBe('ABC');
    type('abcd');
    expect(field().value).toBe('ABC-D');
    expect(completeRecoveryMock).not.toHaveBeenCalled();

    type('abcdef');
    expect(field().value).toBe('ABC-DEF');
    // The api is handed the code as minted; the dash is display only.
    await waitFor(() => expect(completeRecoveryMock).toHaveBeenCalledWith('tok', 'ABCDEF'));
    await waitFor(() => expect(screen.getByText('auth.recover.success.title')).toBeInTheDocument());
  });

  it('drops anything a code is not made of, wherever it is typed or pasted', async () => {
    render(<RecoverPage token="tok" />);

    type('a b!c');
    expect(field().value).toBe('ABC');

    // A rejected character leaves the state as it was, so nothing re-renders;
    // the field still must not be left showing it.
    type('ABC!');
    expect(field().value).toBe('ABC');
    type('ABC  ');
    expect(field().value).toBe('ABC');
    // A code pasted with the dash the other device shows lands whole.
    type('pdf-rz4');
    expect(field().value).toBe('PDF-RZ4');
    await waitFor(() => expect(completeRecoveryMock).toHaveBeenCalledWith('tok', 'PDFRZ4'));
  });

  it('never holds more than a whole code', () => {
    render(<RecoverPage token="tok" />);
    type('abcdefghij');
    expect(field().value).toBe('ABC-DEF');
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

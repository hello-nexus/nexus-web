import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisterFlow } from './RegisterFlow';
import { RESEND_COOLDOWN_SECONDS } from './resendCooldown';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

vi.mock('./CreateAccountForm', () => ({
  CreateAccountForm: ({ onSuccess }: { onSuccess: (email: string, password: string) => void }) => (
    <button type="button" onClick={() => onSuccess('a@b.com', 'pw')}>submit-mock</button>
  ),
}));

describe('RegisterFlow pending view', () => {
  it('starts the resend control on a full cooldown', async () => {
    render(<RegisterFlow backend={{} as never} onBackToSignIn={vi.fn()} onSignedIn={vi.fn()} />);

    fireEvent.click(screen.getByText('submit-mock'));

    const resend = await waitFor(() => screen.getByRole('button', { name: `account.verify.resendWait seconds=${RESEND_COOLDOWN_SECONDS}` }));
    expect((resend as HTMLButtonElement).disabled).toBe(true);
  });
});

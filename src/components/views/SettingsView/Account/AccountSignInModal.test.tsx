import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountSignInModal } from './AccountSignInModal';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../../api/localServiceBackend', () => ({
  localServiceBackend: {
    login: vi.fn(),
    register: vi.fn(),
    recoveryStart: vi.fn(),
    recoveryStatus: vi.fn(),
  },
}));

function renderModal(open: boolean, body?: string) {
  return render(<AccountSignInModal open={open} onClose={vi.fn()} onSignedIn={vi.fn()} ariaLabel="Sign in" body={body} />);
}

describe('AccountSignInModal', () => {
  it('renders nothing while closed', () => {
    renderModal(false, 'why this appeared');
    expect(screen.queryByText('account.signIn.title')).toBeNull();
    expect(screen.queryByText('why this appeared')).toBeNull();
  });

  it('opens on the sign-in form, with the caller-supplied body above it', () => {
    renderModal(true, 'why this appeared');
    expect(screen.getByText('why this appeared')).toBeTruthy();
    expect(screen.getByText('account.signIn.title')).toBeTruthy();
  });

  it('switches to the register flow and comes back to sign-in on the next opening', () => {
    const { rerender } = renderModal(true);
    fireEvent.click(screen.getByText('account.signIn.createAccount'));
    expect(screen.queryByText('account.signIn.title')).toBeNull();

    rerender(<AccountSignInModal open={false} onClose={vi.fn()} onSignedIn={vi.fn()} ariaLabel="Sign in" />);
    rerender(<AccountSignInModal open onClose={vi.fn()} onSignedIn={vi.fn()} ariaLabel="Sign in" />);
    expect(screen.getByText('account.signIn.title')).toBeTruthy();
  });
});

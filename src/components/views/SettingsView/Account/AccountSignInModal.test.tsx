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
  return render(<AccountSignInModal open={open} onClose={vi.fn()} onSignedIn={vi.fn()} title="Sign in" body={body} />);
}

describe('AccountSignInModal', () => {
  it('renders nothing while closed', () => {
    renderModal(false);
    expect(screen.queryByText('account.signIn.identifier')).toBeNull();
  });

  it('opens on the sign-in fields under one line, without repeating the dialog title as a heading', () => {
    renderModal(true);
    expect(screen.getByText('account.signIn.identifier')).toBeTruthy();
    expect(screen.getByText('account.signIn.subtitle')).toBeTruthy();
    expect(screen.queryByText('account.signIn.title')).toBeNull();
  });

  it('shows the caller-supplied line in place of the generic one', () => {
    renderModal(true, 'why this appeared');
    expect(screen.getByText('why this appeared')).toBeTruthy();
    expect(screen.queryByText('account.signIn.subtitle')).toBeNull();
  });

  it('drops the line once another flow brings its own heading', () => {
    renderModal(true, 'why this appeared');
    fireEvent.click(screen.getByText('account.signIn.createAccount'));
    expect(screen.queryByText('why this appeared')).toBeNull();
  });

  it('switches to the register flow and comes back to sign-in on the next opening', () => {
    const { rerender } = renderModal(true);
    fireEvent.click(screen.getByText('account.signIn.createAccount'));
    expect(screen.queryByText('account.signIn.identifier')).toBeNull();

    rerender(<AccountSignInModal open={false} onClose={vi.fn()} onSignedIn={vi.fn()} title="Sign in" />);
    rerender(<AccountSignInModal open onClose={vi.fn()} onSignedIn={vi.fn()} title="Sign in" />);
    expect(screen.getByText('account.signIn.identifier')).toBeTruthy();
  });

  it('shows the title in a header whose X closes the dialog', () => {
    const onClose = vi.fn();
    render(<AccountSignInModal open onClose={onClose} onSignedIn={vi.fn()} title="Sign in to get apps" />);
    expect(screen.getByRole('heading', { name: 'Sign in to get apps' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'app.window.close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateAccountForm } from './CreateAccountForm';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('CreateAccountForm back-to-sign-in clears fields before unmount', () => {
  it('clears password and confirm-password before onBackToSignIn unmounts the form', () => {
    let passwordAtNavTime: string | null = null;
    let confirmAtNavTime: string | null = null;
    const onBackToSignIn = vi.fn(() => {
      passwordAtNavTime = (screen.getByLabelText('account.create.password') as HTMLInputElement).value;
      confirmAtNavTime = (screen.getByLabelText('account.create.confirmPassword') as HTMLInputElement).value;
    });
    render(
      <CreateAccountForm backend={{ register: vi.fn() } as never} onSuccess={vi.fn()} onBackToSignIn={onBackToSignIn} />,
    );

    fireEvent.input(screen.getByLabelText('account.create.email'), { target: { value: 'alice@example.com' } });
    fireEvent.input(screen.getByLabelText('account.create.username'), { target: { value: 'alice' } });
    fireEvent.input(screen.getByLabelText('account.create.password'), { target: { value: 'Hunter22' } });
    fireEvent.input(screen.getByLabelText('account.create.confirmPassword'), { target: { value: 'Hunter22' } });
    fireEvent.click(screen.getByRole('button', { name: 'account.signIn.backToSignIn' }));

    expect(onBackToSignIn).toHaveBeenCalledTimes(1);
    expect(passwordAtNavTime).toBe('');
    expect(confirmAtNavTime).toBe('');
  });

  it('still calls onBackToSignIn when the fields are already empty', () => {
    const onBackToSignIn = vi.fn();
    render(
      <CreateAccountForm backend={{ register: vi.fn() } as never} onSuccess={vi.fn()} onBackToSignIn={onBackToSignIn} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'account.signIn.backToSignIn' }));

    expect(onBackToSignIn).toHaveBeenCalledTimes(1);
  });
});

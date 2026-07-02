import { SignInForm } from '../../components/views/SettingsView/Account/SignInForm';
import { directApiBackend } from '../../api/directApiBackend';
import { PublicAuthGate } from './PublicAuthGate';
import { PublicPageFrame } from './PublicPageFrame';
import { usePublicAccount } from './usePublicAccount';

/** /login - public sign-in page. Redirects to /account when already signed in. */
export function LoginPage() {
  const { account } = usePublicAccount();

  const goToAccount = () => { window.location.href = '/account'; };
  const goToRecover = () => { window.location.href = '/recover'; };
  const goToRegister = () => { window.location.href = '/register'; };

  return (
    <PublicAuthGate account={account}>
      <PublicPageFrame>
        <SignInForm
          backend={directApiBackend}
          onSuccess={goToAccount}
          onForgotPassword={goToRecover}
          onCreateAccount={goToRegister}
        />
      </PublicPageFrame>
    </PublicAuthGate>
  );
}

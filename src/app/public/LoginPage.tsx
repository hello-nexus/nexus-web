import { useEffect } from 'react';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { SignInForm } from '../../components/views/SettingsView/Account/SignInForm';
import { directApiBackend } from '../../api/directApiBackend';
import { PublicPageFrame } from './PublicPageFrame';
import { usePublicAccount } from './usePublicAccount';

/** /login - public sign-in page. Redirects to /account when already signed in. */
export function LoginPage() {
  const { account } = usePublicAccount();

  useEffect(() => {
    if (account) window.location.replace('/account');
  }, [account]);

  if (account === undefined || account) {
    return (
      <PublicPageFrame>
        <Spinner size={32} />
      </PublicPageFrame>
    );
  }

  const goToAccount = () => { window.location.href = '/account'; };
  const goToRecover = () => { window.location.href = '/recover'; };
  const goToRegister = () => { window.location.href = '/register'; };

  return (
    <PublicPageFrame>
      <SignInForm
        backend={directApiBackend}
        onSuccess={goToAccount}
        onForgotPassword={goToRecover}
        onCreateAccount={goToRegister}
      />
    </PublicPageFrame>
  );
}

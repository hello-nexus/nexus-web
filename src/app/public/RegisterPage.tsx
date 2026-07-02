import { useEffect } from 'react';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { RegisterFlow } from '../../components/views/SettingsView/Account/RegisterFlow';
import { directApiBackend } from '../../api/directApiBackend';
import { PublicPageFrame } from './PublicPageFrame';
import { usePublicAccount } from './usePublicAccount';

/** /register - public account creation page. Redirects to /account when already signed in. */
export function RegisterPage() {
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

  const goToSignIn = () => { window.location.href = '/login'; };
  const goToAccount = () => { window.location.href = '/account'; };

  return (
    <PublicPageFrame>
      <RegisterFlow backend={directApiBackend} onBackToSignIn={goToSignIn} onSignedIn={goToAccount} />
    </PublicPageFrame>
  );
}

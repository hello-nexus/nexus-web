import type { AuthBackend } from '../../../../api/authBackend';
import { SignInForm } from './SignInForm';
import { RegisterFlow } from './RegisterFlow';
import { ForgotPasswordFlow } from './ForgotPasswordFlow';

export type AccountSignedOutSubtab = 'login' | 'register' | 'recover';

interface AccountSignedOutProps {
  backend: AuthBackend;
  /** null (or any value outside the three flows) renders the sign-in form. */
  subtab: AccountSignedOutSubtab | null;
  onSubtabChange: (subtab: AccountSignedOutSubtab) => void;
  onRecoveryApproved: () => void;
  // Fired once a login lands (sign-in submit, or the register flow's
  // "I've verified" retry) - the caller owns what "signed in" means (in-app:
  // refresh the accounts hook; public: navigate to /account).
  onSignedIn: () => void;
}

// Routes the three signed-out flows off the caller's subtab (URL-backed in
// the in-app AccountView), so each flow is a distinct, freshly-mounted component whenever the
// subtab changes into it.
export function AccountSignedOut({ backend, subtab, onSubtabChange, onRecoveryApproved, onSignedIn }: AccountSignedOutProps) {
  const goToSignIn = () => onSubtabChange('login');

  if (subtab === 'register') {
    return <RegisterFlow backend={backend} onBackToSignIn={goToSignIn} onSignedIn={onSignedIn} />;
  }

  if (subtab === 'recover') {
    return <ForgotPasswordFlow backend={backend} onBackToSignIn={goToSignIn} onRecoveryApproved={onRecoveryApproved} />;
  }

  return (
    <SignInForm
      backend={backend}
      onSuccess={onSignedIn}
      onForgotPassword={() => onSubtabChange('recover')}
      onCreateAccount={() => onSubtabChange('register')}
    />
  );
}

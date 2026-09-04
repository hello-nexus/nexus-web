import { useEffect, useState } from 'react';
import { Overlay } from '../../../common/Overlay/Overlay';
import { AccountSignedOut, type AccountSignedOutSubtab } from './AccountSignedOut';
import { localServiceBackend } from '../../../../api/localServiceBackend';
import styles from './AccountSignInModal.module.scss';

interface AccountSignInModalProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  /** Why the dialog appeared; the reused sign-in flow brings its own heading. */
  body?: string;
  /** Fired once a session exists: sign-in submit, the register flow's retry, or an approved recovery. */
  onSignedIn: () => void;
}

/** The in-app sign-in, register and recover flows in a dialog over whichever page asked for an account. */
export function AccountSignInModal({ open, onClose, ariaLabel, body, onSignedIn }: AccountSignInModalProps) {
  const [subtab, setSubtab] = useState<AccountSignedOutSubtab>('login');

  // The dialog stays mounted between openings, so every opening starts on sign-in.
  useEffect(() => {
    if (!open) setSubtab('login');
  }, [open]);

  return (
    <Overlay open={open} onClose={onClose} ariaLabel={ariaLabel} className={styles.signInModal}>
      {body && <p className={styles.signInBody}>{body}</p>}
      <AccountSignedOut
        backend={localServiceBackend}
        subtab={subtab}
        onSubtabChange={setSubtab}
        onRecoveryApproved={onSignedIn}
        onSignedIn={onSignedIn}
      />
    </Overlay>
  );
}

import { useLayoutEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { useTranslation } from '../../../lib/i18n';
import styles from './PairingQrView.module.scss';

export interface PairingQrViewProps {
  qrDataUrl?: string;
  expiresAt?: number;
  loading: boolean;
  now: number;
  // 'modal' (default): white QR square with the accent countdown below, on the
  // modal's dark surface. 'card': smaller QR and a black countdown, for the
  // pairing widget whose whole tile is white.
  variant?: 'modal' | 'card';
}

// Shared pairing-QR pane: the white QR square with the fade-from-white reveal
// on re-mint, plus the countdown that flashes in the final 5s. Pure
// presentation — the caller owns minting/refresh and feeds the current token
// (data URL + expiry) and the clock. Used by the Pair-remote modal's QR tab and
// the 2x2 pairing widget so both render identically.
export function PairingQrView({ qrDataUrl, expiresAt, loading, now, variant = 'modal' }: PairingQrViewProps) {
  const { t } = useTranslation();
  // Incrementing key that remounts the reveal overlay on each re-mint so the
  // CSS keyframe re-fires (an animation won't replay on an already-applied
  // class). Tracks the last displayed token so it bumps only on a real change.
  const [revealKey, setRevealKey] = useState(0);
  const lastRevealRef = useRef<string | null>(null);

  // Bump in a layout effect (before paint) so the white overlay covers the new
  // QR on the very first frame it renders — the QR then dissolves in from white
  // with no one-frame flash of the bare new code. The previous token keeps
  // rendering until the new one arrives (the img shows whenever a token is
  // present, regardless of `loading`), so a re-mint never blanks to the loading
  // state — old QR → white flash → new QR.
  useLayoutEffect(() => {
    if (!qrDataUrl) return;
    const token = `${qrDataUrl}|${expiresAt}`;
    if (lastRevealRef.current === token) return;
    lastRevealRef.current = token;
    setRevealKey(k => k + 1);
  }, [qrDataUrl, expiresAt]);

  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  const status = loading || secondsLeft <= 0
    ? t('phonePair.refreshing')
    : t('phonePair.refreshesIn', { seconds: secondsLeft });

  const card = variant === 'card';
  return (
    <>
      <div className={classNames(styles.qrBox, { [styles.qrBoxCard]: card })}>
        {qrDataUrl ? (
          <img src={qrDataUrl} alt={t('phonePair.qrAlt')} />
        ) : (
          <div className={styles.loading}>{t('phonePair.loadingQr')}</div>
        )}
        {revealKey > 0 && (
          <span key={revealKey} className={styles.reveal} aria-hidden="true" />
        )}
      </div>
      <div className={classNames(styles.timer, {
        [styles.timerCard]: card,
        [styles.timerFlash]: secondsLeft > 0 && secondsLeft <= 5,
      })}>
        <span>{status}</span>
      </div>
    </>
  );
}

export default PairingQrView;

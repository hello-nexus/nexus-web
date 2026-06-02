import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import { fetchPanelRemoteControlState } from '../../../api/panel';
import { PairingQrView } from '../../../components/common/PairingQr/PairingQrView';
import { usePairingQrFeed } from '../../../components/common/PairingQr/usePairingQrFeed';
import { useTranslation } from '../../../lib/i18n';
import styles from './PairingWidget.module.scss';

// 2x2 mirror of the Pair-remote QR. Runs the exact same QR feed as the pairing
// page (mint, TTL re-mint, insta-re-mint on a new pairing) via usePairingQrFeed
// and renders it with the shared PairingQrView. When remote pairing is off it
// shows a QR glyph and says so.
export function PairingWidget() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const { qr, loading } = usePairingQrFeed(enabled === true);

  // Poll the killswitch so the widget flips between the QR and the off-state
  // without a reload. 10s matches the dashboard sidebar's cadence — there's no
  // push channel for this flag.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchPanelRemoteControlState().then(result => {
        if (cancelled || !result) return;
        setEnabled(result.enabled);
      });
    };
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  // 1s clock drives the countdown; reset the baseline whenever the token rolls
  // so a fresh QR shows its full TTL immediately.
  useEffect(() => { setNow(Date.now()); }, [qr]);
  useEffect(() => {
    if (enabled !== true) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  if (enabled === false) {
    return (
      <div className={styles.container}>
        <div className={styles.off}>
          <QrCode size={40} aria-hidden="true" />
          <span>{t('panel.pairing.off')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PairingQrView qrDataUrl={qr?.qrDataUrl} expiresAt={qr?.expiresAt} loading={loading} now={now} variant="card" />
    </div>
  );
}

export default PairingWidget;

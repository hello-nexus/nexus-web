import { useEffect, useState } from 'react';
import { fetchPanelRemoteControlState } from '../../../api/panel';
import { PairingQrView } from '../../../components/common/PairingQr/PairingQrView';
import { PairingOffState } from '../../../components/common/PairingQr/PairingOffState';
import { usePairingQrFeed } from '../../../components/common/PairingQr/usePairingQrFeed';
import { useTranslation } from '../../../lib/i18n';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { pairingPreviewQr } from './pairingPreviewData';
import styles from './PairingWidget.module.scss';

// 2x2 mirror of the Pair-remote QR. Runs the exact same QR feed as the pairing
// page (mint, TTL re-mint, insta-re-mint on a new pairing) via usePairingQrFeed
// and renders it with the shared PairingQrView. When remote pairing is off it
// shows a QR glyph and says so.
export function PairingWidget() {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const [enabled, setEnabled] = useState<boolean | null>(preview ? true : null);
  const [now, setNow] = useState(() => Date.now());
  // Frozen at mount so the preview countdown never ticks.
  const [previewQr] = useState(() => (preview ? pairingPreviewQr(Date.now()) : null));
  const { qr, loading } = usePairingQrFeed(enabled === true && !preview);

  // Poll the killswitch so the widget flips between the QR and the off-state
  // without a reload. 10s matches the dashboard sidebar's cadence — there's no
  // push channel for this flag.
  useEffect(() => {
    if (preview) return;
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
  }, [preview]);

  // 1s clock drives the countdown; reset the baseline whenever the token rolls
  // so a fresh QR shows its full TTL immediately.
  useEffect(() => { setNow(Date.now()); }, [qr]);
  useEffect(() => {
    if (preview || enabled !== true) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [preview, enabled]);

  if (enabled === false) {
    return (
      <div className={styles.container}>
        <PairingOffState label={t('panel.pairing.off')} />
      </div>
    );
  }

  const shownQr = preview ? previewQr : qr;
  return (
    <div className={styles.container}>
      <PairingQrView qrDataUrl={shownQr?.qrDataUrl} expiresAt={shownQr?.expiresAt} loading={loading} now={now} variant="card" />
    </div>
  );
}

export default PairingWidget;

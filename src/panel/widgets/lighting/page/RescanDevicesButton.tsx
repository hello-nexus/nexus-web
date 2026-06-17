import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { rescanLightingDevices } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { Button } from '../../../../components/common/Button/Button';
import styles from '../LightingPage.module.scss';

export function RescanDevicesButton({ rgbRunning, scanning }: {
  rgbRunning: boolean;
  scanning: boolean;
}) {
  const { t } = useTranslation();
  const [userRescanning, setUserRescanning] = useState(false);
  const busy = (scanning && rgbRunning) || userRescanning;
  const disabled = !rgbRunning || busy;

  const dotClass = !rgbRunning
    ? styles.rescanDotOff
    : busy
      ? styles.rescanDotScanning
      : styles.rescanDotOn;

  // Hold the local spinner 2s so useRgbStatus observes `scanning=true`
  // and starts polling before it clears. The rescan POST's lighting
  // topic usually refetches within 100-200ms, but the round-trip can
  // lag; 2s avoids an off-then-on flicker.
  const handleClick = async () => {
    if (disabled) return;
    setUserRescanning(true);
    try { await rescanLightingDevices(); }
    finally { setTimeout(() => setUserRescanning(false), 2000); }
  };

  const label = busy
    ? t('lighting.devices.scanning')
    : 'OpenRGB';

  return (
    <Button
      size="sm"
      tone="neutral"
      className={styles.rescanDevicesBtn}
      icon={<span className={`${styles.rescanDot} ${dotClass}`} aria-hidden />}
      iconTrailing={<RefreshCw size={14} className={busy ? styles.rescanIconSpinning : undefined} aria-hidden />}
      onClick={handleClick}
      disabled={disabled}
      aria-label={busy ? t('lighting.devices.scanning') : t('lighting.devices.rescan')}
    >
      {label}
    </Button>
  );
}

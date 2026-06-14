import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { rescanLightingDevices } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { Button } from '../../../../components/common/Button/Button';
import styles from '../LightingPage.module.scss';

/**
 * Labelled rescan action: forces OpenRGB to re-enumerate devices (hot-plug
 * is otherwise automatic). Three-state: subprocess off (disabled), scanning
 * (spinning, disabled), ready.
 */
export function RescanDevicesButton({ rgbRunning, scanning }: {
  /** True when the OpenRGB subprocess is alive. */
  rgbRunning: boolean;
  /** True during initial boot, user rescan, or automatic USB-change rescan. */
  scanning: boolean;
}) {
  const { t } = useTranslation();
  const [userRescanning, setUserRescanning] = useState(false);
  const busy = (scanning && rgbRunning) || userRescanning;
  const disabled = !rgbRunning || busy;

  const labelKey = !rgbRunning ? 'lighting.devices.rescanOff'
    : busy ? 'lighting.devices.rescanning'
    : 'lighting.devices.rescan';

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

  return (
    <Button
      size="sm"
      tone="neutral"
      className={styles.rescanDevicesBtn}
      icon={<RefreshCw size={14} className={busy ? styles.rescanIconSpinning : undefined} aria-hidden />}
      onClick={handleClick}
      disabled={disabled}
    >
      {t(labelKey)}
    </Button>
  );
}

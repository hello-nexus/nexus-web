import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { rescanLightingDevices } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

/**
 * Full-width labelled rescan action: forces OpenRGB to re-enumerate
 * devices (hot-plug is otherwise automatic). Three-state: subprocess
 * off (static disabled), scanning (spinning disabled), ready.
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
    <button
      type="button"
      className={styles.rescanDevicesBtn}
      onClick={handleClick}
      disabled={disabled}
    >
      <RefreshCw size={14} className={busy ? styles.rescanIconSpinning : undefined} aria-hidden />
      <span>{t(labelKey)}</span>
    </button>
  );
}

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { rescanLightingDevices } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

/**
 * Full-width OpenRGB control at the bottom of the device pane. Left: a status
 * dot reflecting the subprocess, then the OpenRGB label (swapped for
 * "Rescanning" while a scan is in flight). Right edge: a refresh icon that
 * re-enumerates devices on press (disabled while the subprocess is down or a
 * scan is running). Sized to match the dashboard's "Add widget" button.
 */
export function OpenRgbButton({ rgbRunning, scanning }: {
  /** True when the OpenRGB subprocess is alive. */
  rgbRunning: boolean;
  /** True during boot, a user rescan, or an automatic USB-change rescan. */
  scanning: boolean;
}) {
  const { t } = useTranslation();
  const [userRescanning, setUserRescanning] = useState(false);
  const busy = (scanning && rgbRunning) || userRescanning;
  const rescanDisabled = !rgbRunning || busy;

  // Hold the local spinner 2s so useRgbStatus observes `scanning=true` and
  // starts polling before it clears. The rescan POST's lighting topic usually
  // refetches within 100-200ms, but the round-trip can lag; 2s avoids an
  // off-then-on flicker.
  const handleRescan = async () => {
    if (rescanDisabled) return;
    setUserRescanning(true);
    try { await rescanLightingDevices(); }
    finally { setTimeout(() => setUserRescanning(false), 2000); }
  };

  const brand = 'OpenRGB';
  const label = busy ? t('lighting.devices.scanning') : brand;

  return (
    <button
      type="button"
      className={styles.openRgbButton}
      onClick={handleRescan}
      disabled={rescanDisabled}
    >
      <span
        className={`${styles.openRgbDot} ${rgbRunning ? styles.openRgbDotOnline : styles.openRgbDotOffline}`}
        aria-hidden
      />
      <span>{label}</span>
      <RefreshCw size={14} className={`${styles.openRgbSpinner} ${busy ? styles.rescanIconSpinning : ''}`} aria-hidden />
    </button>
  );
}

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { rescanLightingDevices } from '../../../api/lighting';
import { useTranslation } from '../../../lib/i18n';
import styles from '../LightingView.module.scss';

/**
 * Full-width labelled rescan action. Forces OpenRGB to re-enumerate the
 * attached devices - normal hot-plug is handled automatically; this button is
 * for the edge case of a device that needed a manual nudge. Three-state:
 * subprocess off (static disabled), scanning (spinning disabled), ready.
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

  // Hold the local spinner long enough for useRgbStatus to observe
  // `scanning=true` and start its poll loop. The rescan POST now broadcasts
  // a lighting topic so the refetch usually happens within 100-200ms, but the
  // network round-trip + state update can take a beat; 2s is a safe window
  // that prevents the brief off-then-on flicker we saw with 500ms.
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
      title={t(labelKey)}
    >
      <RefreshCw size={14} className={busy ? styles.rescanIconSpinning : undefined} aria-hidden />
      <span>{t(labelKey)}</span>
    </button>
  );
}

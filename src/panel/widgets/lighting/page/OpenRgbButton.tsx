import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { rescanLightingDevices } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { Button } from '../../../../components/common/Button/Button';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import styles from '../LightingPage.module.scss';

/**
 * Re-enumerate devices. Disabled while the subprocess is down or a scan is
 * already running; the icon spins for the duration and the tooltip carries the
 * state, so the control stays the size of every other header button.
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

  const label = busy ? t('lighting.devices.scanning') : t('lighting.devices.rescan');

  return (
    <HoverTooltip body={label} side="bottom">
      <Button
        tone="ghost"
        size="sm"
        icon={<RefreshCw className={busy ? styles.rescanIconSpinning : undefined} />}
        aria-label={label}
        disabled={rescanDisabled}
        onClick={handleRescan}
      />
    </HoverTooltip>
  );
}

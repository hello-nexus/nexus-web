import { useTranslation } from '../../../../lib/i18n';
import { OpenRgbGlyph } from '../../../../components/icons/NexusBrand';
import styles from '../LightingPage.module.scss';

/** 'off' while lighting is off; 'detecting' for the scan that turning it on kicks off. */
export type DiscoveryState = 'off' | 'detecting';

/**
 * Tail card on the device rail, explaining why the list may be short. Lighting
 * off shuts the OpenRGB subprocess down, so nothing it would have found is
 * listed until a mode turns it back on and it scans.
 */
export function DeviceDiscoveryCard({ state, rgbRunning }: {
  state: DiscoveryState;
  /** OpenRGB subprocess health, shown as the status dot this card now carries. */
  rgbRunning: boolean;
}) {
  const { t } = useTranslation();
  const detecting = state === 'detecting';
  return (
    <div className={styles.discoveryCard} role="status" aria-live="polite">
      <span className={`${styles.discoveryIcon} ${detecting ? styles.discoveryIconBusy : ''}`} aria-hidden>
        <OpenRgbGlyph size={18} />
      </span>
      <span className={styles.discoveryText}>
        {t(detecting ? 'lighting.devices.discovery.detecting' : 'lighting.devices.discovery.off')}
      </span>
      <span
        className={`${styles.openRgbDot} ${rgbRunning ? styles.openRgbDotOnline : styles.openRgbDotOffline}`}
        role="img"
        aria-label={t(rgbRunning ? 'lighting.devices.openRgbOnline' : 'lighting.devices.openRgbOffline')}
      />
    </div>
  );
}

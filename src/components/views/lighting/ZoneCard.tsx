import { Settings, Power, Eye, Scan } from 'lucide-react';
import {
  identifyLightingDevice,
  type LightingDevice,
} from '../../../api/lighting';
import { useTranslation } from '../../../lib/i18n';
import styles from '../LightingView.module.scss';

/**
 * One card for either a whole OpenRGB device or a motherboard ARGB zone. The
 * service splits motherboards with more than one ARGB header into separate
 * logical devices (`openrgb-N-Z`), so the same card component renders both
 * cases; resizable + identify affordances only show when the zone supports
 * OpenRGB's RESIZEZONE opcode (linear zones on motherboards).
 */
export function ZoneCard({
  device,
  selected,
  indent,
  frameHidden,
  onSelect,
  onTogglePower,
  onToggleFrame,
  onOpenSettings,
}: {
  device: LightingDevice;
  selected: boolean;
  /** True when this card is a zone child rendered under a motherboard group header. */
  indent: boolean;
  /** Whether this device's rectangle is currently hidden on the canvas. */
  frameHidden: boolean;
  onSelect: () => void;
  onTogglePower: () => void;
  onToggleFrame: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const isZone = device.parentDeviceId != null && device.zoneIndex != null;
  const resizable = device.zoneResizable === true && isZone;
  // A zone with 0 LEDs is NOT "detection failed" - ARGB is one-way so the user
  // must tell us how many LEDs are on that strip. Keep the zone card interactive
  // (show the LED-count editor + buttons) so they can configure it. Only flag as
  // unavailable when the zone is both unconfigurable AND reports zero LEDs, or
  // when a non-zone device failed to initialise.
  const unavailable = device.ledCount <= 0 && !resizable;

  const handleIdentify = (e: React.MouseEvent) => {
    e.stopPropagation();
    identifyLightingDevice(device.id, 2000).catch(() => { /* silent */ });
  };

  return (
    <div
      className={[
        styles.deviceCard,
        selected ? styles.deviceCardSelected : '',
        unavailable ? styles.deviceCardUnavailable : '',
        !unavailable && !device.ledsOn ? styles.deviceCardPoweredOff : '',
        indent ? styles.deviceCardZone : '',
      ].filter(Boolean).join(' ')}
      onClick={() => { if (!unavailable) onSelect(); }}
      title={unavailable ? t('lighting.devices.detectionFailedTooltip') : undefined}
    >
      {!unavailable && (
        <div className={styles.deviceCardActions}>
          {device.ledCount > 0 && (
            <>
              <button
                type="button"
                className={styles.deviceSettingsBtn}
                title={t('lighting.devices.identify')}
                aria-label={t('lighting.devices.identify')}
                onClick={handleIdentify}
              >
                <Eye />
              </button>
              <button
                type="button"
                className={`${styles.deviceSettingsBtn} ${frameHidden ? styles.deviceFrameBtnHidden : ''}`}
                title={t(frameHidden ? 'lighting.devices.showFrame' : 'lighting.devices.hideFrame')}
                aria-label={t(frameHidden ? 'lighting.devices.showFrame' : 'lighting.devices.hideFrame')}
                aria-pressed={frameHidden}
                onClick={e => { e.stopPropagation(); onToggleFrame(); }}
              >
                <Scan />
              </button>
              <button
                type="button"
                className={styles.deviceSettingsBtn}
                title={t('lighting.ledMap.settings')}
                aria-label={t('lighting.ledMap.settings')}
                onClick={e => { e.stopPropagation(); onOpenSettings(); }}
              >
                <Settings />
              </button>
            </>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={device.ledsOn}
            className={`${styles.devicePowerBtn} ${device.ledsOn ? styles.devicePowerBtnOn : ''}`}
            title={t(device.ledsOn ? 'lighting.devices.powerOn' : 'lighting.devices.powerOff')}
            aria-label={t(device.ledsOn ? 'lighting.devices.powerOn' : 'lighting.devices.powerOff')}
            onClick={e => { e.stopPropagation(); onTogglePower(); }}
          >
            <Power />
          </button>
        </div>
      )}
      <span className={styles.deviceName}>{device.name}</span>
      {unavailable ? (
        <span className={styles.deviceMetaUnavailable}>
          {t('lighting.devices.detectionFailed')}
        </span>
      ) : resizable ? (
        // Read-only count display: the editable LED-count lives in the LED
        // map editor popup (gear icon) so there's one canonical place to
        // resize + arrange + delete LEDs instead of two affordances that
        // could disagree mid-flight.
        <span className={styles.deviceMetaZone}>
          <span className={styles.zoneLedCountValue}>{device.ledCount}</span>
          <span className={styles.zoneLedCountLabel}>{t('lighting.devices.zoneLedCount')}</span>
        </span>
      ) : isZone && device.zoneType === 'single' ? (
        <span
          className={styles.deviceMeta}
          title={t('lighting.devices.zoneFixedTooltip')}
        >
          {t('lighting.devices.zoneFixed')}
        </span>
      ) : (
        <span className={styles.deviceMeta}>{device.ledCount} LEDs · {device.type}</span>
      )}
    </div>
  );
}

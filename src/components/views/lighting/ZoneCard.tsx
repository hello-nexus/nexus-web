import { useRef } from 'react';
import { Settings, Power, Eye, Lightbulb } from 'lucide-react';
import {
  identifyLightingDevice,
  type LightingDevice,
} from '../../../api/lighting';
import { useTranslation } from '../../../lib/i18n';
import { HoverTooltip } from '../../common/HoverTooltip/HoverTooltip';
import styles from '../LightingView.module.scss';

export interface ZoneCardDrag {
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

/**
 * One card for either a whole OpenRGB device or a motherboard ARGB zone. The
 * service splits motherboards with more than one ARGB header into separate
 * logical devices (`openrgb-N-Z`), so the same card component renders both
 * cases; resizable + identify affordances only show when the zone supports
 * OpenRGB's RESIZEZONE opcode (linear zones on motherboards).
 */
export function ZoneCard({
  device,
  displayName,
  selected,
  indent,
  onSelect,
  onTogglePower,
  onOpenSettings,
  drag,
}: {
  device: LightingDevice;
  /** Overrides the on-card name. Used to strip the parent prefix from child zones. */
  displayName?: string;
  selected: boolean;
  /** True when this card is a zone child rendered under a motherboard group header. */
  indent: boolean;
  onSelect: () => void;
  onTogglePower: () => void;
  onOpenSettings: () => void;
  /** Optional HTML5 drag/drop wiring for reorderable lists. */
  drag?: ZoneCardDrag;
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

  const cardRef = useRef<HTMLDivElement>(null);
  const interactiveSelector = 'button, input, select, textarea, [role="button"], [role="switch"]';

  return (
    <div
      ref={cardRef}
      className={[
        styles.deviceCard,
        selected ? styles.deviceCardSelected : '',
        unavailable ? styles.deviceCardUnavailable : '',
        !unavailable && !device.ledsOn ? styles.deviceCardPoweredOff : '',
        indent ? styles.deviceCardZone : '',
        drag?.isDragging ? styles.deviceCardDragging : '',
        drag?.isDragOver ? styles.deviceCardDragOver : '',
      ].filter(Boolean).join(' ')}
      draggable={!!drag && !unavailable}
      onMouseDownCapture={drag ? (e) => {
        const target = e.target as HTMLElement;
        const interactive = !!target.closest(interactiveSelector);
        if (cardRef.current) cardRef.current.draggable = !unavailable && !interactive;
      } : undefined}
      onDragStart={drag ? (e) => {
        const target = e.target as HTMLElement;
        if (target.closest(interactiveSelector)) { e.preventDefault(); return; }
        drag.onDragStart();
      } : undefined}
      onDragOver={drag ? (e) => { e.preventDefault(); drag.onDragOver(); } : undefined}
      onDragLeave={drag ? drag.onDragLeave : undefined}
      onDrop={drag ? drag.onDrop : undefined}
      onDragEnd={drag ? drag.onDragEnd : undefined}
      onClick={() => { if (!unavailable) onSelect(); }}
      title={unavailable ? t('lighting.devices.detectionFailedTooltip') : undefined}
    >
      <span className={styles.deviceName}>{displayName ?? device.name}</span>
      <div className={styles.deviceMetaRow}>
        {unavailable ? (
          <span className={styles.deviceMetaUnavailable}>
            {t('lighting.devices.detectionFailed')}
          </span>
        ) : isZone && device.zoneType === 'single' && !resizable ? (
          <HoverTooltip body={t('lighting.devices.zoneFixedTooltip')} side="top">
            <span className={styles.deviceMeta}>
              {t('lighting.devices.zoneFixed')}
            </span>
          </HoverTooltip>
        ) : (
          <span className={styles.deviceMeta}>
            <Lightbulb className={styles.deviceMetaIcon} aria-hidden="true" />
            <span className={styles.deviceMetaCount}>{device.ledCount}</span>
          </span>
        )}
        {!unavailable && (
          <div className={styles.deviceCardActions}>
            {device.ledCount > 0 && (
              <>
                <HoverTooltip body={t('lighting.devices.identify')} side="top">
                  <button
                    type="button"
                    className={styles.deviceSettingsBtn}
                    aria-label={t('lighting.devices.identify')}
                    onClick={handleIdentify}
                  >
                    <Eye />
                  </button>
                </HoverTooltip>
                <HoverTooltip body={t('lighting.ledMap.settings')} side="top">
                  <button
                    type="button"
                    className={styles.deviceSettingsBtn}
                    aria-label={t('lighting.ledMap.settings')}
                    onClick={e => { e.stopPropagation(); onOpenSettings(); }}
                  >
                    <Settings />
                  </button>
                </HoverTooltip>
              </>
            )}
            <HoverTooltip body={t(device.ledsOn ? 'lighting.devices.powerOn' : 'lighting.devices.powerOff')} side="top">
            <button
              type="button"
              role="switch"
              aria-checked={device.ledsOn}
              className={`${styles.deviceSettingsBtn} ${device.ledsOn ? '' : styles.devicePowerBtnPersistent}`}
              aria-label={t(device.ledsOn ? 'lighting.devices.powerOn' : 'lighting.devices.powerOff')}
              onClick={e => { e.stopPropagation(); onTogglePower(); }}
            >
              <Power />
            </button>
            </HoverTooltip>
          </div>
        )}
      </div>
    </div>
  );
}

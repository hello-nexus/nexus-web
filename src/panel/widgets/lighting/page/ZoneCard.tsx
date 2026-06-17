import { useRef } from 'react';
import { Settings, Power, Eye, Lightbulb, Users, Cpu } from 'lucide-react';
import {
  identifyLightingDevice,
  type LightingDevice,
} from '../../../../api/lighting';
import { cardEnabledLedCount } from './zoneUtils';
import { useTranslation } from '../../../../lib/i18n';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import styles from '../LightingPage.module.scss';

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
  communityCount,
  onOpenCommunity,
  firmwareControlled,
}: {
  device: LightingDevice;
  /** Overrides the on-card name. Used to strip the parent prefix from child zones. */
  displayName?: string;
  selected: boolean;
  /** True when this card is a zone child rendered under a motherboard group header. */
  indent: boolean;
  /** Receives the shift modifier so the caller can implement shift+click
   *  multi-select on the panel without ZoneCard owning a Set. */
  onSelect: (shiftKey: boolean) => void;
  onTogglePower: () => void;
  onOpenSettings: () => void;
  /** Optional HTML5 drag/drop wiring for reorderable lists. */
  drag?: ZoneCardDrag;
  /** Available community layout count; the badge renders only when positive. */
  communityCount?: number;
  /** Badge click; routes into the LED map editor's Community tab. */
  onOpenCommunity?: () => void;
  /** When true, the card is dimmed and non-interactive; the meta row shows a firmware badge. */
  firmwareControlled?: boolean;
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

  const card = (
    <div
      ref={cardRef}
      className={[
        styles.deviceCard,
        selected && !firmwareControlled ? styles.deviceCardSelected : '',
        unavailable ? styles.deviceCardUnavailable : '',
        !unavailable && (!device.ledsOn || firmwareControlled) ? styles.deviceCardPoweredOff : '',
        indent ? styles.deviceCardZone : '',
        !firmwareControlled && drag?.isDragging ? styles.deviceCardDragging : '',
        !firmwareControlled && drag?.isDragOver ? styles.deviceCardDragOver : '',
      ].filter(Boolean).join(' ')}
      draggable={!!drag && !unavailable && !firmwareControlled}
      onMouseDownCapture={drag && !firmwareControlled ? (e) => {
        const target = e.target as HTMLElement;
        const interactive = !!target.closest(interactiveSelector);
        if (cardRef.current) cardRef.current.draggable = !unavailable && !interactive;
      } : undefined}
      onDragStart={drag && !firmwareControlled ? (e) => {
        const target = e.target as HTMLElement;
        if (target.closest(interactiveSelector)) { e.preventDefault(); return; }
        drag.onDragStart();
      } : undefined}
      onDragOver={drag && !firmwareControlled ? (e) => { e.preventDefault(); drag.onDragOver(); } : undefined}
      onDragLeave={drag && !firmwareControlled ? drag.onDragLeave : undefined}
      onDrop={drag && !firmwareControlled ? drag.onDrop : undefined}
      onDragEnd={drag && !firmwareControlled ? drag.onDragEnd : undefined}
      onClick={e => { if (!unavailable && !firmwareControlled) onSelect(e.shiftKey); }}
    >
      <span className={styles.deviceName}>{displayName ?? device.name}</span>
      <div className={styles.deviceMetaRow}>
        {firmwareControlled ? (
          <span className={styles.deviceMetaFirmware}>
            {/* eslint-disable-next-line i18next/no-literal-string -- aria boolean */}
            <Cpu className={styles.deviceMetaIcon} aria-hidden="true" />
            {t('lighting.devices.smarthub.firmwareBadge')}
          </span>
        ) : unavailable ? (
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
            {/* eslint-disable-next-line i18next/no-literal-string -- aria boolean */}
            <Lightbulb className={styles.deviceMetaIcon} aria-hidden="true" />
            {/* Active (enabled) LEDs, not the zone total. */}
            <span className={styles.deviceMetaCount}>{cardEnabledLedCount(device)}</span>
          </span>
        )}
        {!unavailable && !firmwareControlled && communityCount != null && communityCount > 0 && (
          <HoverTooltip body={t('lighting.mappings.badgeTooltip', { count: communityCount })} side="top">
            <button
              type="button"
              className={styles.communityBadge}
              aria-label={t('lighting.mappings.badgeTooltip', { count: communityCount })}
              onClick={e => { e.stopPropagation(); onOpenCommunity?.(); }}
            >
              <Users aria-hidden />
              {communityCount}
            </button>
          </HoverTooltip>
        )}
        {!unavailable && !firmwareControlled && (
          <div className={styles.deviceCardActions}>
            {device.ledCount > 0 && (
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
            )}
            {(device.ledCount > 0 || resizable) && (
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
  // Only failed/zero-LED zones get an explanatory tooltip; configurable zones
  // are interactive and need no hover label.
  return unavailable
    ? <HoverTooltip body={t('lighting.devices.detectionFailedTooltip')} side="top">{card}</HoverTooltip>
    : card;
}

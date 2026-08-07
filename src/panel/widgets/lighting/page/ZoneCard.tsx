import { Settings, Power, Ban, Eye, Lightbulb, Users, Cpu, Check } from 'lucide-react';
import {
  identifyLightingDevice,
  type LightingDevice,
} from '../../../../api/lighting';
import { cardEnabledLedCount } from './zoneUtils';
import { useTranslation } from '../../../../lib/i18n';
import { isMultiSelectModifier } from '../../../../lib/platform';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { DeviceNotice } from './DeviceNotice';
import { type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import styles from '../LightingPage.module.scss';

/**
 * True when ZoneCard renders this card non-interactive. A zone with 0 LEDs is
 * NOT "detection failed" - ARGB is one-way so the user must tell us how many
 * LEDs are on that strip, and a resizable zone keeps its configure affordance.
 * Only a card that is both unconfigurable AND reports zero LEDs is
 * unavailable. Shared with LightingOnboardingScreen's bulk toggles so the
 * whole-card switch and the bulk actions agree on which cards participate.
 */
export function zoneCardUnavailable(device: LightingDevice): boolean {
  const isZone = device.parentDeviceId != null && device.zoneIndex != null;
  const resizable = device.zoneResizable === true && isZone;
  return device.ledCount <= 0 && !resizable;
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
  onToggleControlled,
  onOpenSettings,
  drag,
  communityCount,
  onOpenCommunity,
  firmwareControlled,
  notice,
  toggleMode,
}: {
  device: LightingDevice;
  /** Overrides the on-card name. Used to strip the parent prefix from child zones. */
  displayName?: string;
  selected: boolean;
  /** True when this card is a zone child rendered under a motherboard group header. */
  indent: boolean;
  /** Receives whether the multi-select modifier (Cmd/Ctrl) was held, so the
   *  caller can implement additive selection without ZoneCard owning a Set. */
  onSelect: (additive: boolean) => void;
  onTogglePower: () => void;
  onToggleControlled: () => void;
  onOpenSettings: () => void;
  /** Optional dnd-kit drag wiring for reorderable lists. */
  drag?: SortableRowArgs;
  /** Available community layout count; the badge renders only when positive. */
  communityCount?: number;
  /** Badge click; routes into the LED map editor's Community tab. */
  onOpenCommunity?: () => void;
  /** When true, the card is dimmed and non-interactive; the meta row shows a firmware badge. */
  firmwareControlled?: boolean;
  /** Optional advisory shown via an (i) next to the device name. */
  notice?: string;
  /** Onboarding selection mode: the whole card is a controlled/ignored
   *  switch (click or Enter/Space fires onToggleControlled) and the per-card
   *  action buttons and community badge are hidden. */
  toggleMode?: boolean;
}) {
  const { t } = useTranslation();
  const isZone = device.parentDeviceId != null && device.zoneIndex != null;
  const resizable = device.zoneResizable === true && isZone;
  const unavailable = zoneCardUnavailable(device);

  const handleIdentify = (e: React.MouseEvent) => {
    e.stopPropagation();
    identifyLightingDevice(device.id, 2000).catch(() => { /* silent */ });
  };

  // Firmware-controlled and unavailable cards stay sort participants (ref +
  // style so neighbours shift around them) but are not themselves draggable -
  // matches their pre-migration locked state.
  const dragEnabled = !!drag && !toggleMode && !unavailable && !firmwareControlled;
  const controlled = device.controlled !== false;
  const toggleable = toggleMode === true && !unavailable && !firmwareControlled;
  // The drag spreads sit after the toggle props below: dnd-kit's
  // role/tabIndex/onKeyDown must win in normal mode, where the toggle props
  // are all undefined and would otherwise erase them.
  const card = (
    <div
      ref={drag?.ref ?? (() => {})}
      style={drag?.style ?? {}}
      role={toggleable ? 'switch' : undefined}
      aria-checked={toggleable ? controlled : undefined}
      aria-label={toggleable ? displayName ?? device.name : undefined}
      tabIndex={toggleable ? 0 : undefined}
      onKeyDown={toggleable ? e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // Keep Enter from bubbling to the modal stack's document listener,
          // which would fire the hosting Overlay's onEnter (Continue).
          e.stopPropagation();
          onToggleControlled();
        }
      } : undefined}
      {...(dragEnabled ? drag!.attributes : {})}
      {...(dragEnabled ? drag!.listeners ?? {} : {})}
      className={[
        styles.deviceCard,
        (toggleMode ? toggleable && controlled : selected && !firmwareControlled) ? styles.deviceCardSelected : '',
        unavailable ? styles.deviceCardUnavailable : '',
        !unavailable && (!device.ledsOn || firmwareControlled || !controlled) ? styles.deviceCardPoweredOff : '',
        indent ? styles.deviceCardZone : '',
        drag?.isDragging ? drag.placeholderClassName : '',
      ].filter(Boolean).join(' ')}
      onClick={e => {
        if (unavailable || firmwareControlled) return;
        if (toggleMode) onToggleControlled();
        else onSelect(isMultiSelectModifier(e));
      }}
    >
      <div className={styles.deviceNameRow}>
        <span className={styles.deviceName}>{displayName ?? device.name}</span>
        {notice != null && !unavailable && <DeviceNotice notice={notice} />}
      </div>
      <div className={styles.deviceMetaRow}>
        {firmwareControlled ? (
          <HoverTooltip body={t('lighting.devices.firmwareTooltip')} side="top">
            <span className={styles.deviceMetaFirmware}>
              {/* eslint-disable-next-line i18next/no-literal-string -- aria boolean */}
              <Cpu className={styles.deviceMetaIcon} aria-hidden="true" />
              {t('lighting.devices.smarthub.firmwareBadge')}
            </span>
          </HoverTooltip>
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
        {toggleable && (
          <span
            className={`${styles.deviceToggleIndicator} ${controlled ? styles.deviceToggleIndicatorOn : ''}`}
            aria-hidden
          >
            {controlled ? <Check /> : <Ban />}
          </span>
        )}
        {!toggleMode && !unavailable && !firmwareControlled && communityCount != null && communityCount > 0 && (
          <HoverTooltip body={t('lighting.mappings.badgeTooltip', { count: communityCount })} side="top">
            <button
              type="button"
              className={styles.communityBadge}
              aria-label={t('lighting.mappings.badgeTooltip', { count: communityCount })}
              data-no-dnd
              onClick={e => { e.stopPropagation(); onOpenCommunity?.(); }}
            >
              <Users aria-hidden />
              {communityCount}
            </button>
          </HoverTooltip>
        )}
        {!toggleMode && !firmwareControlled && (
          <div className={styles.deviceCardActions} data-no-dnd>
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
            {!unavailable && (
              <>
                <HoverTooltip body={t(device.controlled === false ? 'lighting.devices.notControlled' : 'lighting.devices.controlled')} side="top">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={device.controlled !== false}
                    className={`${styles.deviceSettingsBtn} ${device.controlled === false ? styles.devicePowerBtnPersistent : ''}`}
                    aria-label={t(device.controlled === false ? 'lighting.devices.notControlled' : 'lighting.devices.controlled')}
                    onClick={e => { e.stopPropagation(); onToggleControlled(); }}
                  >
                    <Ban />
                  </button>
                </HoverTooltip>
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
              </>
            )}
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

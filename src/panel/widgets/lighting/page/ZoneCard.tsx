import { useRef, useState } from 'react';
import { Settings, Power, PowerOff, Ban, Eye, Lightbulb, Users, Cpu, Check, Unlink, Link2, MoreVertical } from 'lucide-react';
import {
  identifyLightingDevice,
  type LightingDevice,
} from '../../../../api/lighting';
import { DeviceContextMenu, type DeviceMenuItem } from '../../../../components/common/DeviceCanvas/DeviceContextMenu';
import { cardEnabledLedCount, IDENTIFY_MS } from './zoneUtils';
import { useTranslation } from '../../../../lib/i18n';
import { pluralKey } from '../../../../lib/pluralKey';
import { isMultiSelectModifier } from '../../../../lib/platform';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { DeviceNotice } from './DeviceNotice';
import { DeviceLedStrip, type LedPick } from './DeviceLedStrip';
import { startIdentify } from '../../../../lib/identifyFlash';
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

/** The selection a card's menu acts on when the card is part of one. Aggregate
 *  flags follow the canvas convention: true when ANY member still is. */
export interface BulkSelection {
  count: number;
  /** Members that can actually flash, so the identify row never promises to
   *  light a device with no LEDs. */
  identifyCount: number;
  controlled: boolean;
  ledsOn: boolean;
  setControlled: (controlled: boolean) => void;
  setPower: (on: boolean) => void;
  identify: () => void;
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
  selectable = true,
  ledPick,
  ledFullscreen,
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
  bulk,
}: {
  device: LightingDevice;
  /** Overrides the on-card name. Used to strip the parent prefix from child zones. */
  displayName?: string;
  selected: boolean;
  /** False when the running mode reaches every device regardless: the checkbox
   *  reads checked and locked instead of tracking the selection. */
  selectable?: boolean;
  /** This device's own Static selection; the LED strip renders it instead of
   *  sampling the shared canvas. */
  ledPick?: LedPick;
  /** Static mode: the strip samples the whole canvas rather than the device's rect. */
  ledFullscreen?: boolean;
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
  /** When true, the card is non-interactive; the meta row shows a firmware badge. */
  firmwareControlled?: boolean;
  /** Optional advisory shown via an (i) next to the device name. */
  notice?: string;
  /** Onboarding selection mode: the whole card is a controlled/ignored
   *  switch (click or Enter/Space fires onToggleControlled) and the per-card
   *  action buttons and community badge are hidden. */
  toggleMode?: boolean;
  /** Present only when this card is part of a multi-selection. The menu then
   *  acts on the whole selection, matching the device canvas's right-click. */
  bulk?: BulkSelection;
}) {
  const { t, language } = useTranslation();
  const isZone = device.parentDeviceId != null && device.zoneIndex != null;
  const resizable = device.zoneResizable === true && isZone;
  const unavailable = zoneCardUnavailable(device);
  // seq remounts the menu on every open: it latches its own closing state, so
  // a reused instance would fade the reopened menu straight back out.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; seq: number } | null>(null);
  const menuSeq = useRef(0);
  const openMenu = (x: number, y: number) => setMenuAt({ x, y, seq: ++menuSeq.current });

  const identify = () => {
    // Blink the card's readout on the same clock as the hardware.
    startIdentify(device.id, IDENTIFY_MS);
    identifyLightingDevice(device.id, IDENTIFY_MS).catch(() => { /* silent */ });
  };

  // Firmware-controlled and unavailable cards stay sort participants (ref +
  // style so neighbours shift around them) but are not themselves draggable -
  // matches their pre-migration locked state.
  const dragEnabled = !!drag && !toggleMode && !unavailable && !firmwareControlled;
  const controlled = device.controlled !== false;
  const toggleable = toggleMode === true && !unavailable && !firmwareControlled;
  // Same gate as the action-icon row: the onboarding grid and firmware-owned
  // cards expose no per-device controls. A bulk-selected card that can offer
  // no row either (detection-failed, so no identify and no state rows, and
  // the LED map is single-device) gets no button rather than an empty menu.
  const menuEnabled = !toggleMode && !firmwareControlled
    && !(bulk && unavailable && bulk.identifyCount === 0);

  // Persistent marker for a card that is not in its default state, so the
  // reason is readable without hovering. An ignored device is not driven at
  // all, which makes its power state moot, so that chip stands alone.
  const stateChip = !menuEnabled || unavailable
    ? null
    : !controlled
      ? { icon: <Unlink aria-hidden />, label: t('lighting.devices.stateNotControlled') }
      : !device.ledsOn
        ? { icon: <PowerOff aria-hidden />, label: t('lighting.devices.stateLightsOff') }
        : null;

  const menuItems = (): DeviceMenuItem[] => {
    const items: DeviceMenuItem[] = [];
    if (bulk) {
      if (bulk.identifyCount > 0) {
        items.push({ key: 'identify', icon: <Eye size={14} />, label: t(pluralKey('lighting.devices.identifyCount', language, bulk.identifyCount), { count: bulk.identifyCount }), onSelect: bulk.identify });
      }
    } else if (device.ledCount > 0) {
      items.push({ key: 'identify', icon: <Eye size={14} />, label: t('lighting.devices.identify'), onSelect: identify });
    }
    // The LED map edits one device's zones, so a selection has nothing to
    // open - same rule the canvas menu applies.
    if (!bulk) {
      items.push({
        key: 'settings', icon: <Settings size={14} />, label: t('lighting.ledMap.settings'),
        onSelect: onOpenSettings,
      });
    }
    if (!unavailable) {
      // Label and icon name the action, not the state - the widget menu's
      // pin/unpin idiom.
      const isControlled = bulk ? bulk.controlled : controlled;
      const isOn = bulk ? bulk.ledsOn : device.ledsOn;
      const setControlled = () => bulk ? bulk.setControlled(!isControlled) : onToggleControlled();
      const setPower = () => bulk ? bulk.setPower(!isOn) : onTogglePower();
      const label = (single: string, counted: string) =>
        bulk ? t(pluralKey(counted, language, bulk.count), { count: bulk.count }) : t(single);
      items.push(isControlled
        ? { key: 'controlled', icon: <Unlink size={14} />, onSelect: setControlled, label: label('lighting.devices.menuControlOff', 'lighting.devices.menuControlOffCount') }
        : { key: 'controlled', icon: <Link2 size={14} />, onSelect: setControlled, label: label('lighting.devices.menuControlOn', 'lighting.devices.menuControlOnCount') });
      items.push(isOn
        ? { key: 'power', icon: <PowerOff size={14} />, onSelect: setPower, label: label('lighting.devices.menuLightsOff', 'lighting.devices.menuLightsOffCount') }
        : { key: 'power', icon: <Power size={14} />, onSelect: setPower, label: label('lighting.devices.menuLightsOn', 'lighting.devices.menuLightsOnCount') });
    }
    return items;
  };
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
      onContextMenu={menuEnabled ? e => {
        e.preventDefault();
        e.stopPropagation();
        openMenu(e.clientX, e.clientY);
      } : undefined}
    >
      {!unavailable && !toggleMode && (
        <span
          className={`${styles.deviceCheck} ${(selectable ? selected : true) ? styles.deviceCheckOn : ''} ${selectable ? '' : styles.deviceCheckLocked}`}
          role="checkbox"
          aria-checked={selectable ? selected : true}
          aria-disabled={selectable ? undefined : true}
          aria-label={displayName ?? device.name}
          tabIndex={selectable ? 0 : -1}
          data-no-dnd
          onClick={e => {
            e.stopPropagation();
            if (selectable) onSelect(true);
          }}
          onKeyDown={e => {
            if (!selectable) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect(true); }
          }}
        >
          {(selectable ? selected : true) && <Check aria-hidden />}
        </span>
      )}
      <div className={styles.deviceCardBody}>
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
        ) : stateChip ? (
          <span className={styles.deviceStateChip}>
            {stateChip.icon}
            {stateChip.label}
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
        {/* A dark device has nothing to read out, and firmware lighting does not
            come from our canvas, so the bar is absent rather than blank. */}
        {!unavailable && !firmwareControlled && controlled && device.ledsOn && (
          <DeviceLedStrip device={device} pick={ledPick} fullscreen={ledFullscreen} />
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
        {menuEnabled && (
          <div className={styles.deviceCardActions} data-no-dnd>
            <HoverTooltip body={t('lighting.devices.moreActions')} side="top">
              <button
                type="button"
                className={`${styles.deviceSettingsBtn} ${styles.deviceMenuBtn}`}
                aria-label={t('lighting.devices.moreActions')}
                onClick={e => {
                  e.stopPropagation();
                  // Explicit toggle: the button is its own close affordance,
                  // and the menu's outside-pointerdown close has already run.
                  if (menuAt) { setMenuAt(null); return; }
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenu(r.right, r.bottom + 4);
                }}
              >
                <MoreVertical />
              </button>
            </HoverTooltip>
          </div>
        )}
      </div>
      </div>
    </div>
  );
  // Only failed/zero-LED zones get an explanatory tooltip; configurable zones
  // are interactive and need no hover label.
  return (
    <>
      {unavailable
        ? <HoverTooltip body={t('lighting.devices.detectionFailedTooltip')} side="top">{card}</HoverTooltip>
        : card}
      {menuAt && (
        <DeviceContextMenu
          key={menuAt.seq}
          x={menuAt.x}
          y={menuAt.y}
          items={menuItems()}
          onClose={() => setMenuAt(null)}
        />
      )}
    </>
  );
}

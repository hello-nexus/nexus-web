import { useId, useRef, useState, type ReactNode } from 'react';
import { Power, PowerOff, Ban, Blend, Eye, Keyboard, Lightbulb, Users, Cpu, Check, Link2Off, Link2, Layers, MousePointerClick, Paintbrush, Pencil, Pin, PinOff, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  identifyLightingDevice,
  type LightingDevice,
  type PinKind,
} from '../../../../api/lighting';
import { LIGHTING_MODE_ICONS } from '../../../../lib/lightingModeIcons';
import { pinMode } from '../pins';
import { DeviceContextMenu, menuSections, type DeviceMenuItem } from '../../../../components/common/DeviceCanvas/DeviceContextMenu';
import { MenuArrowButton } from '../../../../components/common/DeviceCanvas/MenuArrowButton';
import { DEVICE_NAME_MAX_LENGTH, EditableText, type EditableTextHandle } from '../../../../components/common/Editable/EditableText';
import { bulkMenuLabel } from '../../../../components/common/DeviceCanvas/bulkMenuLabel';
import { groupMenuItems, stackMenuItems, type GroupMove } from '../../../../components/common/DeviceCanvas/groupMenuItems';
import { cardEnabledLedCount, IDENTIFY_MS } from './zoneUtils';
import { useTranslation } from '../../../../lib/i18n';
import { pluralKey } from '../../../../lib/pluralKey';
import { isMultiSelectModifier } from '../../../../lib/platform';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Badge } from '../../../../components/common/Badge/Badge';
import { DeviceNotice } from './DeviceNotice';
import { DeviceLedStrip, type LedPick } from './DeviceLedStrip';
import { startIdentify } from '../../../../lib/identifyFlash';
import { type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import styles from '../LightingPage.module.scss';
import type { StackSlot } from '../../../../lib/stackSlots';

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

/** Whether a PICK can land on a card: Nexus Control off and lights off both
 *  mean it has nowhere to go, so the card trades its checkbox for a state
 *  glyph. Such a card still takes a click - selecting is how the user reaches
 *  the rows that turn those back on - but it is not a target for a colour, and
 *  a pick-only surface refuses it outright. */
export function zoneCardSelectable(device: LightingDevice): boolean {
  return !zoneCardUnavailable(device) && device.controlled !== false && device.ledsOn && device.devicePageReason === undefined;
}

/** Whether a card may stay in the selection: a dark or un-driven card may, but not one set on its device page, which has no engine frame to pin. */
export function zoneCardSelectionHoldable(device: LightingDevice): boolean {
  return !zoneCardUnavailable(device) && device.devicePageReason === undefined;
}

/** The selection a card's menu acts on when the card is part of one. Aggregate
 *  flags follow the canvas convention: true when ANY member still is. */
export interface BulkSelection {
  count: number;
  /** Members that can actually flash, so the identify row never promises to
   *  light a device with no LEDs. */
  identifyCount: number;
  /** Members a colour trim can reach, so the row never promises to tune a card
   *  the modal will drop. */
  tunableCount: number;
  controlled: boolean;
  ledsOn: boolean;
  setControlled: (controlled: boolean) => void;
  setPower: (on: boolean) => void;
  identify: () => void;
  /** Wraps the selection in a new group where it sits. Absent when the cards
   *  sit in different containers, or the nesting limit or group cap forbids. */
  group?: () => void;
  /** Stacks the selection to one frame; present when its rows share a container. */
  stack?: () => void;
  /** Takes the selection apart; present when it is exactly one stack. */
  unstack?: () => void;
  /** Members a Pin row can pin: following the global mode. Zero where
   *  nothing can be pinned (Off). */
  pinCount?: number;
  /** Members currently pinned, which an Unpin row releases. */
  unpinCount?: number;
  setPinned?: (pinned: boolean) => void;
}

/** Hint id of the one-time coachmark on the first pin; the id is also the `data-coachmark` value. */
export const LIGHTING_PIN_HINT_ID = 'lighting-pin';

/**
 * The card's pin. A card either follows the global mode or is pinned to a
 * target. Only a pinned card shows the pin button, beside its LED strip, and a
 * press unpins it; the menu offers Pin on a following card and Unpin on a
 * pinned one.
 */
export interface DevicePin {
  pinned: boolean;
  /** Display name of what the card is pinned to (tooltip). */
  targetName?: string;
  /** What the card is pinned to; the button wears that mode's tab icon. */
  kind?: PinKind;
  /** Why this card cannot be pinned right now (Off). */
  disabledReason?: string;
  setPinned: (pinned: boolean) => void;
  /** Marks this card's pin button as the target of the first-pin coachmark. */
  hint?: boolean;
}

/** Where a card sits under a {@link ZoneCardStack} header: every member seams
 *  to the row above it, only the last rounds the bottom. */
export type StackPosition = 'inner' | 'last';

/** Device-level actions behind a stack header's kebab; the group header's rows,
 *  minus the ones only a user group has. */
export interface StackMenu {
  /** Flashes every zone that has LEDs; absent when none does. */
  onIdentify?: () => void;
  /** Opens the LED map editor on the device, which lists all of its zones. */
  onOpenSettings?: () => void;
  /** True iff at least one zone has its LEDs on, so the row offers to turn the device off. */
  on: boolean;
  onTogglePower: () => void;
  /** True iff at least one zone is controlled, so the row offers to release the device. */
  controlled: boolean;
  onToggleControlled: () => void;
  /** Commits a new device name; absent where no stored name could come back. */
  onRename?: (name: string) => void;
  /** Present only on a renamed device; puts the header back on the hardware name. */
  onResetName?: () => void;
  /** Stacks every zone of the device to one frame. */
  stack?: () => void;
  /** Takes the device's zones apart again. */
  unstack?: () => void;
}

/**
 * One device's zones under its name, as a single card. Each member is a full
 * ZoneCard with its own selection and menu; the stack owns the corners and the
 * rail drag, so the device moves as one block and its zones can never be split
 * up - which is why the name is a row inside the card, not a group header.
 * The header row is the device: clicking it selects every zone, and its kebab
 * acts on them all.
 */
export function ZoneCardStack({ name, anchorId, selected, drag, onSelect, menu, zoneCount = 0, children }: {
  /** The device name, shown once above the zones. */
  name: string;
  /** Deep-link anchor the stack answers to; see CollapsibleSection's searchAnchor. */
  anchorId?: string;
  /** True while any zone under the header is selected: the header takes the
   *  selected fill (no border - that stays on the zone) so the device reads as
   *  one unit with something selected. */
  selected?: boolean;
  /** Optional dnd-kit drag wiring for the whole stack. */
  drag?: SortableRowArgs;
  /** Header click, with whether the multi-select modifier was held, the way a
   *  card's onSelect reports it. Absent leaves the header a plain label. */
  onSelect?: (additive: boolean) => void;
  /** Absent on pick-only surfaces, which get no kebab. */
  menu?: StackMenu;
  /** Zones under the header, which the stack row counts. */
  zoneCount?: number;
  children: ReactNode;
}) {
  const { t, language } = useTranslation();
  // seq remounts the menu on every open; see ZoneCard for the same pattern.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; seq: number } | null>(null);
  const menuSeq = useRef(0);
  const openMenu = (x: number, y: number) => setMenuAt({ x, y, seq: ++menuSeq.current });
  const nameRef = useRef<EditableTextHandle>(null);

  // Same sections as a card's menu.
  const menuItems = (): DeviceMenuItem[] => {
    if (!menu) return [];
    const editors: DeviceMenuItem[] = [];
    if (menu.onOpenSettings) {
      editors.push({ key: 'settings', icon: <Paintbrush size={14} />, label: t('lighting.ledMap.settings'), onSelect: menu.onOpenSettings });
    }
    const toggles: DeviceMenuItem[] = [
      menu.on
        ? { key: 'power', icon: <PowerOff size={14} />, label: t('lighting.devices.menuLightsOff'), onSelect: menu.onTogglePower }
        : { key: 'power', icon: <Power size={14} />, label: t('lighting.devices.menuLightsOn'), onSelect: menu.onTogglePower },
      menu.controlled
        ? { key: 'controlled', icon: <Link2Off size={14} />, label: t('lighting.devices.menuControlOff'), onSelect: menu.onToggleControlled }
        : { key: 'controlled', icon: <Link2 size={14} />, label: t('lighting.devices.menuControlOn'), onSelect: menu.onToggleControlled },
    ];
    const locate: DeviceMenuItem[] = [];
    if (menu.onIdentify) {
      locate.push({ key: 'identify', icon: <Eye size={14} />, label: t('lighting.devices.identify'), onSelect: menu.onIdentify });
    }
    const organise: DeviceMenuItem[] = [];
    if (menu.onRename) {
      organise.push({ key: 'rename', icon: <Pencil size={14} />, label: t('lighting.devices.rename'), onSelect: () => nameRef.current?.startEditing() });
    }
    if (menu.onResetName) {
      organise.push({ key: 'resetName', icon: <RotateCcw size={14} />, label: t('lighting.devices.resetName'), onSelect: menu.onResetName });
    }
    organise.push(...stackMenuItems(t, language, menu, zoneCount));
    return menuSections(editors, toggles, locate, organise);
  };

  return (
    <>
      <div
        ref={drag?.ref ?? (() => {})}
        style={drag?.style ?? {}}
        {...(drag?.attributes ?? {})}
        {...(drag?.listeners ?? {})}
        data-search-anchor={anchorId}
        className={`${styles.deviceCardStack}${drag?.isDragging ? ` ${drag.placeholderClassName}` : ''}`}
      >
        <div
          className={[
            styles.deviceCardStackHeader,
            onSelect ? styles.deviceCardStackHeaderSelectable : '',
            selected ? styles.deviceCardStackHeaderSelected : '',
          ].filter(Boolean).join(' ')}
          data-menu-arrow-host={menu ? 'true' : undefined}
          onClick={onSelect ? e => onSelect(isMultiSelectModifier(e)) : undefined}
          onContextMenu={menu ? e => {
            e.preventDefault();
            e.stopPropagation();
            openMenu(e.clientX, e.clientY);
          } : undefined}
        >
          {menu?.onRename ? (
            /* Only a click inside the open editor is kept from the header: on
               the label it must still select the zones, and a press there
               drags the stack like the rest of the bar. */
            <span
              style={{ display: 'contents' }}
              onClick={e => { if ((e.target as HTMLElement).tagName === 'INPUT') e.stopPropagation(); }}
            >
              <EditableText
                ref={nameRef}
                value={name}
                onCommit={menu.onRename}
                maxLength={DEVICE_NAME_MAX_LENGTH}
                className={styles.deviceCardStackName}
                clickToEdit={false}
              />
            </span>
          ) : (
            <span className={styles.deviceCardStackName}>{name}</span>
          )}
          {menu && (
            <MenuArrowButton
              variant="card"
              label={t('lighting.devices.groupActions', { name })}
              tooltip={t('lighting.devices.moreActions')}
              open={menuAt != null}
              onOpen={openMenu}
              onClose={() => setMenuAt(null)}
            />
          )}
        </div>
        {children}
      </div>
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

/**
 * One card for either a whole OpenRGB device or a motherboard ARGB zone. The
 * service splits motherboards with more than one ARGB header into separate
 * logical devices (`openrgb-N-Z`), so the same card component renders both
 * cases; resizable + identify affordances only show when the zone supports
 * OpenRGB's RESIZEZONE opcode (linear zones on motherboards).
 */
export function ZoneCard({
  device,
  anchorId,
  displayName,
  selected,
  ledPick,
  ledFullscreen,
  ledPickOnly,
  indent,
  onSelect,
  onTogglePower,
  onToggleControlled,
  onOpenSettings,
  onOpenColorTuning,
  onOpenKeyReactions,
  typeReactiveOn,
  onRename,
  drag,
  communityCount,
  onOpenCommunity,
  firmwareControlled,
  onTakeControl,
  onOpenDevicePage,
  groupMove,
  inStack,
  colorTuned,
  onUnstack,
  notice,
  toggleMode,
  selectOnly,
  onSelectOnly,
  bulk,
  stacked,
  stackSlot,
  pin,
  target = false,
  pulseSeq,
}: {
  device: LightingDevice;
  /** Deep-link anchor the card answers to; see CollapsibleSection's searchAnchor. */
  anchorId?: string;
  /** Overrides the on-card name. Used to strip the parent prefix from child zones. */
  displayName?: string;
  selected: boolean;
  /** This device's own Static selection; the LED strip renders it instead of
   *  sampling the shared canvas. */
  ledPick?: LedPick;
  /** Static mode: the strip samples the whole canvas rather than the device's rect. */
  ledFullscreen?: boolean;
  /** Per-device surface: with no pick the strip stays blank instead of
   *  sampling a shared canvas that does not describe this device. */
  ledPickOnly?: boolean;
  /** True when this card is a zone child rendered under a motherboard group header. */
  indent: boolean;
  /** Receives whether the multi-select modifier (Cmd/Ctrl) was held, so the
   *  caller can implement additive selection without ZoneCard owning a Set. */
  onSelect: (additive: boolean) => void;
  /** Omitted by select-only callers, where no control can reach them. */
  onTogglePower?: () => void;
  onToggleControlled?: () => void;
  onOpenSettings?: () => void;
  /** Opens the colour-tuning modal. Unlike the LED map it is meaningful for a
   *  whole selection, so the row stays on the menu in bulk mode. */
  onOpenColorTuning?: () => void;
  /** Opens the key-reactions modal on this keyboard. Like Customize it stays
   *  on THIS card in a selection; omitted for a card that is not a per-key keyboard. */
  onOpenKeyReactions?: () => void;
  /** Type reactive is on for this card's device: a badge beside the strip opens the editor. */
  typeReactiveOn?: boolean;
  /** Commits a new display name for this card. Omitted by surfaces that only
   *  pick devices (onboarding, the immersive Static picker), where the name is
   *  a label and not a control. Committing an empty string is impossible -
   *  EditableText drops it - so clearing a rename is not offered here. */
  onRename?: (name: string) => void;
  /** Optional dnd-kit drag wiring for reorderable lists. */
  drag?: SortableRowArgs;
  /** Available community layout count; the badge renders only when positive. */
  communityCount?: number;
  /** Badge click; routes into the LED map editor's Community tab. */
  onOpenCommunity?: () => void;
  /** When true, the card is non-interactive; the meta row shows a firmware badge. */
  firmwareControlled?: boolean;
  /** Present when the firmware mode driving this card can be handed back to
   *  Nexus (the Lian Li hub's per-LED "custom" mode). */
  onTakeControl?: () => void;
  /** Opens the device page, where a firmware-owned card's own effect is set. */
  onOpenDevicePage?: () => void;
  /** Group placement for this card's rail row: the card, or the stack it is a
   *  zone of. */
  groupMove?: GroupMove;
  /** Set on a card stacked with others (not the zone-card stack below): the
   *  badge in the name row counts the stack. */
  inStack?: { count: number };
  /** Some color-tuning control is off neutral for this card: a dim mark in the
   *  name row, beside the stack badge. */
  colorTuned?: boolean;
  /** Takes this card out of its stack. */
  onUnstack?: () => void;
  /** Optional advisory shown via an (i) next to the device name. */
  notice?: string;
  /** Onboarding selection mode: the whole card is a controlled/ignored
   *  switch (click or Enter/Space fires onToggleControlled) and the per-card
   *  action buttons and community badge are hidden. */
  toggleMode?: boolean;
  /** Selection-only mode: the checkbox and card-click selection stay, the
   *  per-card actions and context menu go. For surfaces that pick devices and
   *  nothing else, like the immersive Static editor's Devices tab. */
  selectOnly?: boolean;
  /** Narrow the selection to this card alone. Offered on every menu except a
   *  card that cannot be selected at all. */
  onSelectOnly?: () => void;
  /** Present only when this card is part of a multi-selection. The menu then
   *  acts on the whole selection, matching the device canvas's right-click. */
  bulk?: BulkSelection;
  /** Set on a member of a {@link ZoneCardStack}: squares the corners, draws
   *  the seam above it, and rounds the bottom on the last member. */
  stacked?: StackPosition;
  /** The part of the shared frame this card's device samples when its stack is laid out; the readout reads the same slot. */
  stackSlot?: StackSlot | null;
  /** Pin beside the LED strip. Absent on surfaces without one. */
  pin?: DevicePin;
  /** The next pick lands on this card. */
  target?: boolean;
  /** Set when a press or pick changed this card; each new value plays the pulse once. */
  pulseSeq?: number;
}) {
  const { t, language } = useTranslation();
  const unpinHintId = useId();
  const isZone = device.parentDeviceId != null && device.zoneIndex != null;
  const resizable = device.zoneResizable === true && isZone;
  const unavailable = zoneCardUnavailable(device);
  const PinIcon = pin?.kind ? LIGHTING_MODE_ICONS[pinMode(pin.kind)] : Pin;
  // A card mounting (group expand, filter) under a past pulse plays none.
  const [mountPulseSeq] = useState(pulseSeq);
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
  // Same surfaces the action row is on. A card whose whole body is a switch
  // (onboarding) or a bare pick target (Static picker) keeps a plain label.
  const renameEnabled = !!onRename && !toggleMode && !selectOnly && !unavailable;
  // Same gate as the action-icon row: the onboarding grid exposes no per-device
  // controls. A firmware-owned card offers only its device page, take control
  // and the naming and grouping rows, so it opts in when one of those exists.
  const menuEnabled = !toggleMode && !selectOnly
    && (firmwareControlled ? !!onTakeControl || !!onOpenDevicePage || renameEnabled || !!groupMove : true);

  // Persistent marker for a card that is not in its default state, so the
  // reason is readable without hovering. An ignored device is not driven at
  // all, which makes its power state moot, so that chip stands alone.
  // Rides its own flag, not menuEnabled: a select-only card still has to say
  // that a device is off or not controlled, it just offers no way to change it.
  const stateChip = firmwareControlled || unavailable
    || (bulk && unavailable && bulk.identifyCount === 0)
    ? null
    : !controlled
      ? { icon: <Link2Off size={11} />, label: t('lighting.devices.stateNotControlled') }
      : toggleMode
        // Power is moot where the card only decides what Nexus drives.
        ? null
        : !device.ledsOn
          ? { icon: <PowerOff size={11} />, label: t('lighting.devices.stateLightsOff') }
          : null;
  // Nexus Control off and lights off each mean a pick has nowhere to land, and
  // selecting is how the user reaches the rows that fix them, so neither blocks
  // a click. A detection failure and firmware ownership still do: there is
  // nothing behind those to act on. A pick-only surface carries no menu, so
  // there it keeps the old rule - a tap would commit a look the device cannot
  // show, and its own select-all skips those cards.
  const clickable = !unavailable && !firmwareControlled
    && (!selectOnly || zoneCardSelectable(device));
  const nameRef = useRef<EditableTextHandle>(null);

  // Naming and grouping close the menu: they change what the card IS, where
  // everything above them acts on what it does.
  const organiseItems = (): DeviceMenuItem[] => {
    const organise: DeviceMenuItem[] = [];
    if (!bulk && renameEnabled) {
      organise.push({
        key: 'rename',
        icon: <Pencil size={14} />,
        label: t('lighting.devices.rename'),
        onSelect: () => nameRef.current?.startEditing(),
      });
      // Clearing a rename has no inline affordance - an empty commit is
      // dropped - so the menu is the only way back to the hardware name.
      if (device.originalName != null) {
        organise.push({
          key: 'resetName',
          icon: <RotateCcw size={14} />,
          label: t('lighting.devices.resetName'),
          onSelect: () => onRename?.(''),
        });
      }
    }
    organise.push(...groupMenuItems(t, language, 'lighting.devices', groupMove, bulk));
    organise.push(...stackMenuItems(t, language, bulk ? bulk : { unstack: onUnstack }, bulk?.count ?? 1));
    return organise;
  };

  const menuItems = (): DeviceMenuItem[] => {
    const items: DeviceMenuItem[] = [];
    // The engine's rows (Customize, tuning, power, pins) cannot act while
    // firmware owns the LEDs; the device page, the handoff and organising can.
    if (firmwareControlled) {
      if (onOpenDevicePage) {
        items.push({
          key: 'openDevicePage',
          icon: <SlidersHorizontal size={14} />,
          label: t('lighting.devices.menuOpenDevicePage'),
          onSelect: onOpenDevicePage,
        });
      }
      if (onTakeControl) {
        items.push({
          key: 'takeControl',
          icon: <Link2 size={14} />,
          label: t('lighting.devices.menuTakeControl'),
          onSelect: onTakeControl,
          highlighted: true,
        });
      }
      return menuSections(items, organiseItems());
    }
    // Customize opens the LED map on THIS card's device, so it keeps its row in
    // a selection spanning devices.
    const editors: DeviceMenuItem[] = [{
      key: 'settings', icon: <Paintbrush size={14} />, label: t('lighting.ledMap.settings'),
      onSelect: () => onOpenSettings?.(),
    }];
    // Colour tuning is per device but reads the same for a whole selection -
    // trimming eight strips to match each other is the point. The modal scopes
    // itself to the cards a trim can reach and drops the rest, so the row counts
    // THOSE: a selection may hold dark and un-driven cards it will not touch.
    const tunableCount = bulk ? bulk.tunableCount : (zoneCardSelectable(device) ? 1 : 0);
    if (onOpenColorTuning && tunableCount > 0) {
      editors.push({
        key: 'colorTuning',
        icon: <Blend size={14} />,
        label: bulkMenuLabel(t, language, bulk && { count: tunableCount }, 'lighting.colorTuning.menu', 'lighting.colorTuning.menuCount'),
        onSelect: onOpenColorTuning,
      });
    }
    if (onOpenKeyReactions) {
      editors.push({
        key: 'keyReactions',
        icon: <Keyboard size={14} />,
        label: t('lighting.keyReactions.menu'),
        onSelect: onOpenKeyReactions,
      });
    }
    const toggles: DeviceMenuItem[] = [];
    if (!unavailable) {
      // Label and icon name the action, not the state - the widget menu's
      // pin/unpin idiom.
      const isControlled = bulk ? bulk.controlled : controlled;
      const isOn = bulk ? bulk.ledsOn : device.ledsOn;
      const setControlled = () => bulk ? bulk.setControlled(!isControlled) : onToggleControlled?.();
      const setPower = () => bulk ? bulk.setPower(!isOn) : onTogglePower?.();
      const label = (single: string, counted: string) => bulkMenuLabel(t, language, bulk, single, counted);
      // Whichever row un-sticks the card's current state gets the accent, and
      // only one ever does: an un-driven device ignores its power state, so
      // lights take the accent only once control is back on.
      toggles.push(isOn
        ? { key: 'power', icon: <PowerOff size={14} />, onSelect: setPower, label: label('lighting.devices.menuLightsOff', 'lighting.devices.menuLightsOffCount') }
        : { key: 'power', icon: <Power size={14} />, onSelect: setPower, label: label('lighting.devices.menuLightsOn', 'lighting.devices.menuLightsOnCount'), highlighted: isControlled });
      toggles.push(isControlled
        ? { key: 'controlled', icon: <Link2Off size={14} />, onSelect: setControlled, label: label('lighting.devices.menuControlOff', 'lighting.devices.menuControlOffCount') }
        : { key: 'controlled', icon: <Link2 size={14} />, onSelect: setControlled, label: label('lighting.devices.menuControlOn', 'lighting.devices.menuControlOnCount'), highlighted: true });
    }
    // The pin. Unpin is offered wherever something is pinned; Pin only where a
    // pin can be set. In a selection each row counts the members it will reach.
    if (pin && !unavailable) {
      const pinCount = bulk ? (bulk.pinCount ?? 0) : (!pin.pinned && !pin.disabledReason ? 1 : 0);
      const unpinCount = bulk ? (bulk.unpinCount ?? 0) : (pin.pinned ? 1 : 0);
      const setPinned = (pinned: boolean) => bulk ? bulk.setPinned?.(pinned) : pin.setPinned(pinned);
      if (pinCount > 0) {
        toggles.push({
          key: 'pin', icon: <Pin size={14} />, onSelect: () => setPinned(true),
          label: bulkMenuLabel(t, language, bulk && { count: pinCount }, 'lighting.devices.pin', 'lighting.devices.pinCount'),
        });
      }
      if (unpinCount > 0) {
        toggles.push({
          key: 'unpin', icon: <PinOff size={14} />, onSelect: () => setPinned(false),
          label: bulkMenuLabel(t, language, bulk && { count: unpinCount }, 'lighting.devices.unpin', 'lighting.devices.unpinCount'),
        });
      }
    }
    const locate: DeviceMenuItem[] = [];
    if (bulk) {
      if (bulk.identifyCount > 0) {
        locate.push({ key: 'identify', icon: <Eye size={14} />, label: t(pluralKey('lighting.devices.identifyCount', language, bulk.identifyCount), { count: bulk.identifyCount }), onSelect: bulk.identify });
      }
    } else if (device.ledCount > 0) {
      locate.push({ key: 'identify', icon: <Eye size={14} />, label: t('lighting.devices.identify'), onSelect: identify });
    }
    // Names the device, so it is unambiguous which card the selection is about
    // to narrow to. Narrowing to this card is pointless when it IS the whole
    // selection, so the row clears it instead.
    if (clickable && selected && !bulk) {
      locate.push({
        key: 'deselect',
        icon: <MousePointerClick size={14} />,
        label: t('lighting.devices.deselect'),
        onSelect: () => onSelect(true),
      });
    } else if (onSelectOnly && clickable) {
      locate.push({
        key: 'selectOnly',
        icon: <MousePointerClick size={14} />,
        label: t('lighting.devices.selectOnly', { name: displayName ?? device.name }),
        onSelect: onSelectOnly,
      });
    }
    return menuSections(editors, toggles, locate, organiseItems());
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
      data-search-anchor={anchorId}
      tabIndex={toggleable ? 0 : undefined}
      onKeyDown={toggleable ? e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // Keep Enter from bubbling to the modal stack's document listener,
          // which would fire the hosting Overlay's onEnter (Continue).
          e.stopPropagation();
          onToggleControlled?.();
        }
      } : undefined}
      {...(dragEnabled ? drag!.attributes : {})}
      {...(dragEnabled ? drag!.listeners ?? {} : {})}
      className={[
        styles.deviceCard,
        (toggleMode ? toggleable && controlled : selected && !firmwareControlled) ? styles.deviceCardSelected : '',
        target && !toggleMode && !unavailable && !firmwareControlled ? styles.deviceCardTarget : '',
        unavailable ? styles.deviceCardUnavailable : '',
        !unavailable && (!device.ledsOn || firmwareControlled || !controlled) ? styles.deviceCardPoweredOff : '',
        indent ? styles.deviceCardZone : '',
        stacked ? styles.deviceCardStacked : '',
        stacked === 'last' ? styles.deviceCardStackLast : '',
        drag?.isDragging ? drag.placeholderClassName : '',
      ].filter(Boolean).join(' ')}
      data-menu-arrow-host={menuEnabled || undefined}
      onClick={e => {
        if (!clickable) return;
        // Toggle mode is how an un-driven device gets turned back on, so it
        // runs before the Nexus-Control gate rather than after it.
        if (toggleMode) { onToggleControlled?.(); return; }
        onSelect(isMultiSelectModifier(e));
      }}
      onContextMenu={menuEnabled ? e => {
        e.preventDefault();
        e.stopPropagation();
        openMenu(e.clientX, e.clientY);
      } : undefined}
    >
      <div className={styles.deviceCardBody}>
      <div className={styles.deviceNameRow}>
        {renameEnabled ? (
          /* display:contents span carries data-no-dnd onto a real DOM node
             (EditableText doesn't forward unknown props) so a press on the name
             does not start a card drag while a rename is open; no layout change.
             Only a click inside the open editor is withheld from the card - on
             the label it must select, like any other part of the card. */
          <span
            data-no-dnd
            style={{ display: 'contents' }}
            onClick={e => { if ((e.target as HTMLElement).tagName === 'INPUT') e.stopPropagation(); }}
          >
            {/* Rename is a context-menu action: clicking a card's name should
                select the card, not open a text field under the cursor. */}
            <EditableText
              ref={nameRef}
              value={displayName ?? device.name}
              onCommit={onRename!}
              maxLength={DEVICE_NAME_MAX_LENGTH}
              className={`${styles.deviceName} ${styles.deviceNameEditable}`}
              clickToEdit={false}
            />
          </span>
        ) : (
          <span className={styles.deviceName}>{displayName ?? device.name}</span>
        )}
        {notice != null && !unavailable && <DeviceNotice notice={notice} />}
        {colorTuned && (
          <HoverTooltip body={t('lighting.colorTuning.title')} side="top">
            <span className={styles.deviceTuneBadge} role="img" aria-label={t('lighting.colorTuning.title')}>
              <Blend size={12} aria-hidden />
            </span>
          </HoverTooltip>
        )}
        {inStack && (
          <HoverTooltip body={t(pluralKey('lighting.devices.stackedCount', language, inStack.count), { count: inStack.count })} side="top">
            <span className={styles.deviceStackBadge} role="img" aria-label={t(pluralKey('lighting.devices.stackedCount', language, inStack.count), { count: inStack.count })}>
              <Layers size={12} aria-hidden />
            </span>
          </HoverTooltip>
        )}
      </div>
      <div className={styles.deviceMetaRow}>
        {firmwareControlled ? (
          <HoverTooltip
            body={t(device.devicePageReason === 'argbInput' ? 'lighting.devices.devicePageArgbTooltip' : device.devicePageReason === 'firmware' ? 'lighting.devices.devicePageFirmwareTooltip' : 'lighting.devices.firmwareTooltip')}
            side="top"
          >
            <span className={styles.deviceMetaBadge}>
              <Badge label={t('lighting.devices.hardwareControlBadge')} icon={<Cpu size={11} />} compact uppercase color="var(--text-dim)" />
            </span>
          </HoverTooltip>
        ) : unavailable ? (
          <span className={styles.deviceMetaUnavailable}>
            {t('lighting.devices.detectionFailed')}
          </span>
        ) : stateChip ? (
          <Badge label={stateChip.label} icon={stateChip.icon} compact uppercase color="var(--text-dim)" />
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
          <DeviceLedStrip device={device} slot={stackSlot} pick={ledPick} fullscreen={ledFullscreen} pickOnly={ledPickOnly} />
        )}
        {/* Only a pinned card carries the button, in its mode's tab icon; hover
            shows PinOff and a press unpins. Pinning a following card is the
            menu's Pin, or a pick with it selected. */}
        {pin?.pinned && !toggleMode && !unavailable && !firmwareControlled && (
          <HoverTooltip title={t('lighting.pin.pinnedTo', { name: pin.targetName ?? '' })} body={t('lighting.pin.clickToUnpin')} side="top">
            <button
              type="button"
              className={`${styles.deviceSettingsBtn} ${styles.deviceBadgeBtn} ${styles.devicePinBtn}`}
              aria-label={t('lighting.pin.pinnedTo', { name: pin.targetName ?? '' })}
              aria-describedby={unpinHintId}
              data-no-dnd
              data-coachmark={pin.hint ? LIGHTING_PIN_HINT_ID : undefined}
              onClick={e => {
                e.stopPropagation();
                pin.setPinned(false);
              }}
            >
              <PinIcon className={styles.devicePinMode} />
              <PinOff className={styles.devicePinOff} />
              <span id={unpinHintId} hidden>{t('lighting.pin.clickToUnpin')}</span>
            </button>
          </HoverTooltip>
        )}
        {/* LEDs holding a colour from the LED map. A press opens the map, where
            they are edited; it never clears them. */}
        {!!device.ledColors?.length && onOpenSettings && !toggleMode && !unavailable && !firmwareControlled && (
          <HoverTooltip body={t('lighting.devices.ledColorsBadge')} side="top">
            <button
              type="button"
              className={`${styles.deviceSettingsBtn} ${styles.deviceBadgeBtn}`}
              aria-label={t('lighting.devices.ledColorsBadge')}
              data-no-dnd
              onClick={e => { e.stopPropagation(); onOpenSettings(); }}
            >
              <Paintbrush />
            </button>
          </HoverTooltip>
        )}
        {typeReactiveOn && onOpenKeyReactions && !toggleMode && !unavailable && !firmwareControlled && (
          <HoverTooltip body={t('lighting.keyReactions.badge')} side="top">
            <button
              type="button"
              className={`${styles.deviceSettingsBtn} ${styles.deviceBadgeBtn}`}
              aria-label={t('lighting.keyReactions.badge')}
              data-no-dnd
              onClick={e => { e.stopPropagation(); onOpenKeyReactions(); }}
            >
              <Keyboard />
            </button>
          </HoverTooltip>
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
      </div>
      </div>
      {menuEnabled && (
        <MenuArrowButton
          variant="card"
          label={t('lighting.devices.moreActions')}
          tooltip={t('lighting.devices.moreActions')}
          open={menuAt != null}
          onOpen={openMenu}
          onClose={() => setMenuAt(null)}
        />
      )}
      {/* The light highlight level; its global CSS ships with the command palette. */}
      {pulseSeq !== undefined && pulseSeq !== mountPulseSeq && (
        <span key={pulseSeq} className={styles.deviceCardPulse} aria-hidden><span className="nexus-highlight-light" /></span>
      )}
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

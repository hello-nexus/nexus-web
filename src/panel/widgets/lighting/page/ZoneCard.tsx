import { useRef, useState, type ReactNode } from 'react';
import { Settings, Power, PowerOff, Ban, Eye, Lightbulb, Users, Cpu, Check, Unlink, Link, Layers, MoreVertical, MousePointerClick, Pencil, RotateCcw, SlidersHorizontal } from 'lucide-react';
import {
  identifyLightingDevice,
  type LightingDevice,
} from '../../../../api/lighting';
import { DeviceContextMenu, type DeviceMenuItem } from '../../../../components/common/DeviceCanvas/DeviceContextMenu';
import { DEVICE_NAME_MAX_LENGTH, EditableText, type EditableTextHandle } from '../../../../components/common/Editable/EditableText';
import { bulkMenuLabel } from '../../../../components/common/DeviceCanvas/bulkMenuLabel';
import { groupMenuItems, linkMenuItems, type GroupMove } from '../../../../components/common/DeviceCanvas/groupMenuItems';
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
  return !zoneCardUnavailable(device) && device.controlled !== false && device.ledsOn;
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
  /** True when every selected card is a zone of the SAME device, so the LED map still has one device to open. */
  oneDevice: boolean;
  setControlled: (controlled: boolean) => void;
  setPower: (on: boolean) => void;
  identify: () => void;
  /** Wraps the selection in a new group where it sits. Absent when the cards
   *  sit in different containers, or the nesting limit or group cap forbids. */
  group?: () => void;
  /** Links the selection to one frame; present when its rows share a container. */
  link?: () => void;
  /** Takes the selection apart; present when it is exactly one link. */
  unlink?: () => void;
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
  /** Omits the lights row - firmware owns the device's LEDs. */
  hideLights?: boolean;
  /** Commits a new device name; absent where no stored name could come back. */
  onRename?: (name: string) => void;
  /** Present only on a renamed device; puts the header back on the hardware name. */
  onResetName?: () => void;
  /** Links every zone of the device to one frame. */
  link?: () => void;
  /** Takes the device's zones apart again. */
  unlink?: () => void;
}

/**
 * One device's zones under its name, as a single card. Each member is a full
 * ZoneCard with its own selection and menu; the stack owns the corners and the
 * rail drag, so the device moves as one block and its zones can never be split
 * up - which is why the name is a row inside the card, not a group header.
 * The header row is the device: clicking it selects every zone, and its kebab
 * acts on them all.
 */
export function ZoneCardStack({ name, selected, drag, onSelect, menu, zoneCount = 0, children }: {
  /** The device name, shown once above the zones. */
  name: string;
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
  /** Zones under the header, which the link row counts. */
  zoneCount?: number;
  children: ReactNode;
}) {
  const { t, language } = useTranslation();
  // seq remounts the menu on every open; see ZoneCard for the same pattern.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; seq: number } | null>(null);
  const menuSeq = useRef(0);
  const openMenu = (x: number, y: number) => setMenuAt({ x, y, seq: ++menuSeq.current });
  const nameRef = useRef<EditableTextHandle>(null);

  // Same order as a card's menu: what the device does first, then its state,
  // then what it is called.
  const menuItems = (): DeviceMenuItem[] => {
    if (!menu) return [];
    const items: DeviceMenuItem[] = [];
    if (menu.onIdentify) {
      items.push({ key: 'identify', icon: <Eye size={14} />, label: t('lighting.devices.identify'), onSelect: menu.onIdentify });
    }
    if (menu.onOpenSettings) {
      items.push({ key: 'settings', icon: <Settings size={14} />, label: t('lighting.ledMap.settings'), onSelect: menu.onOpenSettings });
    }
    if (!menu.hideLights) {
      items.push(menu.on
        ? { key: 'power', icon: <PowerOff size={14} />, label: t('lighting.devices.menuLightsOff'), onSelect: menu.onTogglePower }
        : { key: 'power', icon: <Power size={14} />, label: t('lighting.devices.menuLightsOn'), onSelect: menu.onTogglePower });
    }
    items.push(menu.controlled
      ? { key: 'controlled', icon: <Unlink size={14} />, label: t('lighting.devices.menuControlOff'), onSelect: menu.onToggleControlled }
      : { key: 'controlled', icon: <Link size={14} />, label: t('lighting.devices.menuControlOn'), onSelect: menu.onToggleControlled });
    if (menu.onRename) {
      items.push({ key: 'rename', icon: <Pencil size={14} />, label: t('lighting.devices.rename'), onSelect: () => nameRef.current?.startEditing() });
    }
    if (menu.onResetName) {
      items.push({ key: 'resetName', icon: <RotateCcw size={14} />, label: t('lighting.devices.resetName'), onSelect: menu.onResetName });
    }
    items.push(...linkMenuItems(t, language, menu, zoneCount));
    return items;
  };

  return (
    <>
      <div
        ref={drag?.ref ?? (() => {})}
        style={drag?.style ?? {}}
        {...(drag?.attributes ?? {})}
        {...(drag?.listeners ?? {})}
        className={`${styles.deviceCardStack}${drag?.isDragging ? ` ${drag.placeholderClassName}` : ''}`}
      >
        <div
          className={[
            styles.deviceCardStackHeader,
            onSelect ? styles.deviceCardStackHeaderSelectable : '',
            selected ? styles.deviceCardStackHeaderSelected : '',
          ].filter(Boolean).join(' ')}
          onClick={onSelect ? e => onSelect(isMultiSelectModifier(e)) : undefined}
          onContextMenu={menu ? e => {
            e.preventDefault();
            e.stopPropagation();
            openMenu(e.clientX, e.clientY);
          } : undefined}
        >
          {menu?.onRename ? (
            /* data-no-dnd so a press on the name edits instead of dragging the
               stack. Only a click inside the open editor is kept from the
               header: on the label it must still select the zones. */
            <span
              data-no-dnd
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
            <HoverTooltip body={t('lighting.devices.moreActions')} side="top">
              <button
                type="button"
                className={`${styles.deviceSettingsBtn} ${styles.deviceMenuBtn} ${styles.deviceCardStackMenuBtn}`}
                aria-label={t('lighting.devices.groupActions', { name })}
                data-no-dnd
                onClick={e => {
                  e.stopPropagation();
                  if (menuAt) { setMenuAt(null); return; }
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenu(r.right, r.bottom + 4);
                }}
              >
                <MoreVertical />
              </button>
            </HoverTooltip>
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
  onRename,
  drag,
  communityCount,
  onOpenCommunity,
  firmwareControlled,
  onTakeControl,
  groupMove,
  linked,
  onUnlink,
  notice,
  toggleMode,
  selectOnly,
  onSelectOnly,
  bulk,
  stacked,
}: {
  device: LightingDevice;
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
   *  Nexus (the Lian Li hub's per-LED "custom" mode). Gives a firmware-owned
   *  card its only menu row; absent, such a card stays menu-less. */
  onTakeControl?: () => void;
  /** Group placement for this card's rail row: the card, or the stack it is a
   *  zone of. */
  groupMove?: GroupMove;
  /** Set on a card linked to others: the badge in the name row counts the link. */
  linked?: { count: number };
  /** Takes this card out of its link. */
  onUnlink?: () => void;
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
  // A firmware-owned card offers exactly one row - take control - so it opts
  // in only when that handler exists; every other gate is unchanged.
  const menuEnabled = !toggleMode && !selectOnly
    && (firmwareControlled ? !!onTakeControl : true)
    && !(bulk && unavailable && bulk.identifyCount === 0);
  // Same surfaces the action row is on. A card whose whole body is a switch
  // (onboarding) or a bare pick target (Static picker) keeps a plain label.
  const renameEnabled = !!onRename && !toggleMode && !selectOnly && !unavailable && !firmwareControlled;

  // Persistent marker for a card that is not in its default state, so the
  // reason is readable without hovering. An ignored device is not driven at
  // all, which makes its power state moot, so that chip stands alone.
  // Rides its own flag, not menuEnabled: a select-only card still has to say
  // that a device is off or not controlled, it just offers no way to change it.
  const stateChip = firmwareControlled || unavailable
    || (bulk && unavailable && bulk.identifyCount === 0)
    ? null
    : !controlled
      ? { icon: <Unlink size={11} />, label: t('lighting.devices.stateNotControlled') }
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

  const menuItems = (): DeviceMenuItem[] => {
    const items: DeviceMenuItem[] = [];
    // Nothing else on the menu can act while firmware owns the LEDs, so the
    // handoff is the whole menu rather than one row among dead ones.
    if (firmwareControlled) {
      if (onTakeControl) {
        items.push({
          key: 'takeControl',
          icon: <Link size={14} />,
          label: t('lighting.devices.menuTakeControl'),
          onSelect: onTakeControl,
          highlighted: true,
        });
      }
      return items;
    }
    // Leads the menu and names the device, so it is unambiguous which card the
    // selection is about to narrow to. Narrowing to this card is pointless when
    // it IS the whole selection, so the row becomes the only useful thing left:
    // clearing it.
    if (clickable && selected && !bulk) {
      items.push({
        key: 'deselect',
        icon: <MousePointerClick size={14} />,
        label: t('lighting.devices.deselect'),
        onSelect: () => onSelect(true),
        separatorAfter: true,
      });
    } else if (onSelectOnly && clickable) {
      items.push({
        key: 'selectOnly',
        icon: <MousePointerClick size={14} />,
        label: t('lighting.devices.selectOnly', { name: displayName ?? device.name }),
        onSelect: onSelectOnly,
        separatorAfter: true,
      });
    }
    if (bulk) {
      if (bulk.identifyCount > 0) {
        items.push({ key: 'identify', icon: <Eye size={14} />, label: t(pluralKey('lighting.devices.identifyCount', language, bulk.identifyCount), { count: bulk.identifyCount }), onSelect: bulk.identify });
      }
    } else if (device.ledCount > 0) {
      items.push({ key: 'identify', icon: <Eye size={14} />, label: t('lighting.devices.identify'), onSelect: identify });
    }
    // The LED map edits one device's zones, so it needs the selection to name
    // exactly one - which a multi-zone device's own zones do (the keeb's keys
    // plus underglow are one device). A selection spanning devices has nothing
    // to open; same rule the canvas menu applies.
    if (!bulk || bulk.oneDevice) {
      items.push({
        key: 'settings', icon: <Settings size={14} />, label: t('lighting.ledMap.settings'),
        onSelect: () => onOpenSettings?.(),
      });
    }
    // Colour tuning is per device but reads the same for a whole selection -
    // trimming eight strips to match each other is the point - so unlike the
    // LED map it keeps its row in bulk mode. The modal scopes itself to the
    // cards a trim can reach and drops the rest, so the row counts THOSE: a
    // selection may now hold dark and un-driven cards it will not touch.
    const tunableCount = bulk ? bulk.tunableCount : (zoneCardSelectable(device) ? 1 : 0);
    if (onOpenColorTuning && tunableCount > 0) {
      items.push({
        key: 'colorTuning',
        icon: <SlidersHorizontal size={14} />,
        label: bulkMenuLabel(t, language, bulk && { count: tunableCount }, 'lighting.colorTuning.menu', 'lighting.colorTuning.menuCount'),
        onSelect: onOpenColorTuning,
      });
    }
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
      items.push(isOn
        ? { key: 'power', icon: <PowerOff size={14} />, onSelect: setPower, label: label('lighting.devices.menuLightsOff', 'lighting.devices.menuLightsOffCount') }
        : { key: 'power', icon: <Power size={14} />, onSelect: setPower, label: label('lighting.devices.menuLightsOn', 'lighting.devices.menuLightsOnCount'), highlighted: isControlled });
      items.push(isControlled
        ? { key: 'controlled', icon: <Unlink size={14} />, onSelect: setControlled, label: label('lighting.devices.menuControlOff', 'lighting.devices.menuControlOffCount') }
        : { key: 'controlled', icon: <Link size={14} />, onSelect: setControlled, label: label('lighting.devices.menuControlOn', 'lighting.devices.menuControlOnCount'), highlighted: true });
    }
    // Naming and grouping close the menu, under a rule: they change what the
    // card IS, where everything above acts on what it does.
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
    organise.push(...linkMenuItems(t, language, bulk ? bulk : { unlink: onUnlink }, bulk?.count ?? 1));
    if (organise.length > 0) {
      if (items.length > 0) items[items.length - 1].separatorAfter = true;
      items.push(...organise);
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
          onToggleControlled?.();
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
        stacked ? styles.deviceCardStacked : '',
        stacked === 'last' ? styles.deviceCardStackLast : '',
        drag?.isDragging ? drag.placeholderClassName : '',
      ].filter(Boolean).join(' ')}
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
        {linked && (
          <HoverTooltip body={t(pluralKey('lighting.devices.linkedCount', language, linked.count), { count: linked.count })} side="top">
            <span className={styles.deviceLinked} aria-label={t(pluralKey('lighting.devices.linkedCount', language, linked.count), { count: linked.count })}>
              <Layers size={12} aria-hidden />
            </span>
          </HoverTooltip>
        )}
      </div>
      <div className={styles.deviceMetaRow}>
        {firmwareControlled ? (
          <HoverTooltip body={t('lighting.devices.firmwareTooltip')} side="top">
            <span className={styles.deviceMetaBadge}>
              <Badge
                label={t('lighting.devices.smarthub.firmwareBadge')}
                icon={<Cpu size={11} />}
                compact
                uppercase
                color="var(--text-dim)"
              />
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
          <DeviceLedStrip device={device} pick={ledPick} fullscreen={ledFullscreen} pickOnly={ledPickOnly} />
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

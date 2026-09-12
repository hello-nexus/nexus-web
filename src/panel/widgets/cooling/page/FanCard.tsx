import { memo, useEffect, useRef, useState } from 'react';
import { isMultiSelectModifier } from '../../../../lib/platform';
import { CircleSlash, Cpu, Fan, Folder, FolderInput, FolderMinus, FolderPlus, GaugeCircle, Gpu, Link, Lock, LockOpen, MoreVertical, MousePointerClick, Pencil, Plus, RotateCcw, Unlink, Unplug } from 'lucide-react';
import { type FanChannel, type FanRole, isFanDisconnected } from '../../../../api/cooling';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { Badge } from '../../../../components/common/Badge/Badge';
import { formatNumber } from '../../../../lib/units';
import type { CurveDef, FanState } from '../../../../types/cooling';
import { DEVICE_NAME_MAX_LENGTH, EditableText, type EditableTextHandle } from '../../../../components/common/Editable/EditableText';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Popover } from '../../../../components/common/Popover/Popover';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import { DeviceContextMenu, type DeviceMenuItem } from '../../../../components/common/DeviceCanvas/DeviceContextMenu';
import { bulkMenuLabel } from '../../../../components/common/DeviceCanvas/bulkMenuLabel';
import { type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import styles from '../CoolingPage.module.scss';

/**
 * One fan card, styled to match the lighting page's device cards: editable
 * name on top, the live RPM as an icon + value on the right (like the LED
 * count), a thin duty bar, and the mode dropdown (BIOS / Manual / curves /
 * Create curve). Wire DnD also binds / unbinds when a wire layer is present.
 *
 * When the fan is disconnected (calibration marked it "Unresponsive" AND it
 * reports no RPM - see isFanDisconnected), the card collapses to a single
 * "Disconnected" marker and hides the duty bar + dropdown - nothing here can
 * drive the channel. A "Fixed" fan (RPM barely moves across the duty sweep)
 * keeps its RPM readout but shows a "Fixed speed" marker and no mode dropdown.
 */
/**
 * Hub-level cooling mode reflected back to a fan card. NP50 + MiniHub fans
 * surface a "live" hub mode that overrides per-fan softwareControl:
 *   - 'motherboard': hub passes PWM through from the motherboard. Reads as
 *      BIOS on every fan on that hub.
 *   - 'firmware'   : NP50 and Q-series. Hub plays its firmware speed setpoint.
 *      Reads as a new "FW Control" option on every NP50 and Q-series fan.
 *   - 'software'   : Nexus drives. Fall through to per-fan state.
 * Undefined on anything that is not one of those hubs, GPU fans included.
 */
export type FanCardHubMode = 'software' | 'motherboard' | 'firmware';

/** The selection a fan card's menu acts on when the card is part of one.
 *  Aggregate flags follow the lighting cards' convention: true when ANY member
 *  still is, so one press lands every member on the same state. */
export interface FanBulkSelection {
  count: number;
  locked: boolean;
  controlled: boolean;
  setLocked: (locked: boolean) => void;
  setControlled: (controlled: boolean) => void;
}

export const FanCard = memo(function FanCard({
  channel, state, curves, calibrating, compact, canCreateCurve = true, highlighted,
  selected = false, onSelect,
  hubMode, hubSupportsFirmware,
  hubSupportsBios = true,
  nubRef, cardRef: cardRefProp, onWirePointerDown, onWireHover,
  onSetMode, onCreateCurve, onRename, onSpeedChange, onToggleLock, onToggleControlled, onSetRole, onClearOffset, drag,
  onSelectOnly, bulk, groupMove,
}: {
  channel: FanChannel;
  state: FanState | undefined;
  curves: CurveDef[];
  calibrating?: boolean;
  /** Multi-select membership; a mode change on any selected card applies to all. */
  selected?: boolean;
  /** Body click. Receives whether the multi-select modifier was held, so the
   *  caller owns additive vs replace without FanCard holding a Set. */
  onSelect?: (additive: boolean) => void;
  /** Sidebar layout: 100% width, tighter padding. Used by the cooling page's right-side fan list. */
  compact?: boolean;
  /** When false, the mode dropdown hides the "Create curve" option (curve cap reached). */
  canCreateCurve?: boolean;
  /** Visual emphasis - this fan is bound to the currently-selected curve. */
  highlighted?: boolean;
  /** When set, overrides the per-fan softwareControl-derived modeValue. See
   *  FanCardHubMode for semantics. Undefined for motherboard fans. */
  hubMode?: FanCardHubMode;
  /** True for NP50 and Q-series fans (the hub drives fan speed from firmware).
   *  Adds the "FW Control" dropdown option. MiniHub fans get only BIOS / Manual /
   *  curves. */
  hubSupportsFirmware?: boolean;
  /** Whether the hub offers a motherboard "BIOS" hand-off. True for everything
   *  except NP50 (firmware control IS its off setting). A Q-series pump sets
   *  both this and hubSupportsFirmware so its dropdown lists BIOS + FW Control. */
  hubSupportsBios?: boolean;
  /** Ref handed to the input nub so the wire SVG can read its bbox. */
  nubRef?: (el: HTMLDivElement | null) => void;
  /** Ref handed to the card root so the wire DnD hit-test can treat the
   *  whole fan card as a drop target. */
  cardRef?: (el: HTMLDivElement | null) => void;
  /** Pointer-down on the input nub starts a wire drag. */
  onWirePointerDown?: (e: React.PointerEvent) => void;
  /** Card hover in/out so a wire layer can highlight the connected wire. */
  onWireHover?: (id: string | null) => void;
  onSetMode: (value: string) => void;
  onCreateCurve: () => void;
  onRename: (id: string, name: string) => void;
  onSpeedChange: (id: string, speed: number) => void;
  onToggleLock: (id: string, locked: boolean) => void;
  /** Nexus Control on/off for this channel. Off releases it to the motherboard
   *  and keeps every preset apply off it. Absent on surfaces that cannot set it. */
  onToggleControlled?: (id: string, controlled: boolean) => void;
  onSetRole: (id: string, role: FanRole) => void;
  /** Clears a per-fan duty offset (the FanControl import is what creates them). Absent on surfaces that do not offer it. */
  onClearOffset?: (id: string) => void;
  drag?: SortableRowArgs;
  /** Narrow the selection to this card alone. Offered on every menu except a
   *  card that cannot be selected at all. */
  onSelectOnly?: () => void;
  /** Group placement for the rail block this card belongs to, driving the
   *  "Move to group" flyout. A fan on a hub moves with its whole block, the
   *  way dragging one does. */
  groupMove?: {
    /** User groups it can move into; the one it already sits in is left out. */
    targets: readonly { id: string; name: string }[];
    onMove: (groupId: string) => void;
    /** Present only while the block sits in a user group; the row names it. */
    onRemove?: { name: string; run: () => void };
    /** Absent once the group cap is reached. */
    onMoveToNew?: () => void;
  };
  /** Present only when this card is part of a multi-selection. The menu then
   *  acts on the whole selection, matching the lighting device card. */
  bulk?: FanBulkSelection;
}) {
  const { t, language } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const dutyPct = Math.max(0, Math.min(100, channel.dutyPercent));
  const swEnabled = state?.softwareControl ?? false;
  const assignedCurveId = state?.curveId ?? '';
  // The hub's "off" / hand-off mode: BIOS (motherboard) when supported;
  // FW when only firmware control is available (NP50); 'manual' when the hub
  // has no hand-off at all (software-only, e.g. Corsair iCUE LINK).
  const offMode = hubSupportsBios ? 'bios' : (hubSupportsFirmware ? 'fw' : 'manual');
  // When the hub is in motherboard or firmware mode, the per-fan
  // softwareControl flag is meaningless - the hub takes over for every
  // fan on it. Surface that in the dropdown so the user sees the same
  // mode on every fan in the same group. Motherboard reads as BIOS when the
  // hub has a BIOS hand-off, else as FW (NP50); firmware always reads as FW.
  const hubOverrideMode =
    hubMode === 'motherboard' ? (hubSupportsBios ? 'bios' : 'fw')
    : hubMode === 'firmware'  ? 'fw'
    : null;
  const isManual = swEnabled && !assignedCurveId && hubOverrideMode === null;
  const modeValue = hubOverrideMode ?? (!swEnabled ? offMode : (assignedCurveId || 'manual'));
  // Driven = Nexus controls this fan (Manual or a Curve), i.e. not BIOS/FW.
  // Highlighted on the duty bar (see .fanCardActive), not by tinting the card.
  const driven = swEnabled && hubOverrideMode === null;
  // Hardware-level disconnect (no tach, no controllable duty). When true the
  // card collapses to a single "Disconnected" marker; the dropdown and duty
  // bar disappear because nothing the user does here will drive the channel.
  const isHwDisconnected = isFanDisconnected(channel);
  // Fixed-speed fan: calibration found the RPM barely moves across the full
  // 0-100% duty sweep (classification = "Fixed"), i.e. the header ignores
  // PWM and no software control is possible. The card keeps its live RPM
  // readout but drops the duty bar and hard-disables the mode dropdown;
  // re-calibration (global button) is the only way back to Controllable.
  const isFixed = channel.classification === 'Fixed';
  // Telemetry-only channel (Q-series pump today): header readout only, no duty
  // bar or mode dropdown - nothing here drives it.
  const isReadOnly = channel.readOnly ?? false;
  // A fan Nexus cannot drive says so in the badge under its name, and takes no
  // selection - the lighting rail's rule for an un-driven device.
  // Read-only channels render no badge at all (their branch is null), but they
  // are just as un-drivable, so the selection gate keys off this too.
  // Nexus Control off: the user handed this channel to the motherboard or a
  // vendor app. Unlike BIOS Control it survives a preset apply, so the card
  // drops its mode dropdown entirely rather than showing a mode we do not own -
  // the lighting device card's treatment for the same state.
  const controlled = channel.controlled !== false;
  // Nexus Control off does not block a click: selecting is how the user
  // reaches the row that turns it back on. A disconnected, fixed-speed or
  // BIOS-owned fan has nothing behind it to act on, so those still do.
  const clickable = !isHwDisconnected && !isFixed && !isReadOnly;
  const stateBadge = isHwDisconnected
    ? { icon: <Unplug size={11} />, label: t('cooling.fan.disconnected') }
    : isFixed ? { icon: <CircleSlash size={11} />, label: t('cooling.fan.fixed') }
    : !controlled ? { icon: <Unlink size={11} />, label: t('cooling.fan.notControlled') }
    : null;
  const locked = channel.locked ?? false;
  // An offset shifts this fan off whatever drives it, so it says so on the
  // card: an import can set one, and nothing else would show why the fan sits
  // above its curve.
  const offset = channel.offset ?? 0;
  const role: FanRole = channel.role ?? 'none';
  const RoleIcon = role === 'cpu' ? Cpu : role === 'gpu' ? Gpu : Fan;

  // Local drag intent. null = no unconfirmed user input; the knob follows the
  // live server duty, so a manual level restored server-side (leaving a
  // preset for Custom) renders without waiting for a remount. Set on drag so
  // the knob never snaps back mid-gesture while the realtime duty catches up.
  const [manualTarget, setManualTarget] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const speedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSpeedRef = useRef<number | null>(null);

  // Device-role picker anchored on the fan icon. Popover positions itself
  // absolute against this wrapper (see Popover.tsx).
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const roleAnchorRef = useRef<HTMLDivElement | null>(null);
  // seq remounts the menu on every open: it latches its own closing state, so
  // a reused instance would fade the reopened menu straight back out. Same
  // shape as ZoneCard.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; seq: number } | null>(null);
  const menuSeq = useRef(0);
  const nameRef = useRef<EditableTextHandle>(null);
  const openMenu = (x: number, y: number) => setMenuAt({ x, y, seq: ++menuSeq.current });
  const roleChoices: Array<{ value: FanRole; label: string; Icon: typeof Fan }> = [
    { value: 'none', label: t('cooling.fanRole.generic'), Icon: Fan },
    { value: 'cpu', label: t('cooling.label.cpu'), Icon: Cpu },
    { value: 'gpu', label: t('cooling.label.gpu'), Icon: Gpu },
  ];

  // Another regime took the fan over (curve / BIOS / firmware): drop the
  // local intent so the next Manual phase starts from the server's duty.
  // Keyed on the state-derived regime, NOT channel.mode - hub providers
  // report "Manual" from their software-controlled flag even while a curve
  // drives the fan, so mode never flips on a hub fan's preset phase.
  useEffect(() => {
    if (!isManual) setManualTarget(null);
  }, [isManual]);

  // Confirmation: once the live duty reports the dragged value (and nothing
  // is in flight), hand the knob back to the server so a later change from
  // another window/panel is not masked by this one's stale intent.
  useEffect(() => {
    if (manualTarget === null) return;
    if (draggingRef.current || pendingSpeedRef.current !== null || speedTimerRef.current !== null) return;
    if (dutyPct === manualTarget) setManualTarget(null);
  }, [dutyPct, manualTarget]);

  const targetPct = manualTarget ?? dutyPct;

  const commitSpeed = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    setManualTarget(clamped);
    pendingSpeedRef.current = clamped;
    if (!speedTimerRef.current) {
      speedTimerRef.current = setTimeout(() => {
        speedTimerRef.current = null;
        if (pendingSpeedRef.current !== null) {
          onSpeedChange(channel.id, pendingSpeedRef.current);
          pendingSpeedRef.current = null;
        }
      }, 100);
    }
  };

  const pctFromEvent = (e: React.PointerEvent | PointerEvent) => {
    if (!barRef.current) return 50;
    const rect = barRef.current.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * 100;
  };

  const onBarPointerDown = (e: React.PointerEvent) => {
    if (!isManual) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    commitSpeed(pctFromEvent(e));
  };

  const onBarPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    commitSpeed(pctFromEvent(e));
  };

  const onBarPointerUp = () => {
    draggingRef.current = false;
    if (speedTimerRef.current) {
      clearTimeout(speedTimerRef.current);
      speedTimerRef.current = null;
    }
    if (pendingSpeedRef.current !== null) {
      onSpeedChange(channel.id, pendingSpeedRef.current);
      pendingSpeedRef.current = null;
    }
  };

  const dragClasses = [
    driven && !isFixed ? styles.fanCardActive : '',
    compact ? styles.fanCardCompact : '',
    isHwDisconnected || isFixed || !controlled ? styles.fanCardOff : '',
    drag?.isDragging ? drag.placeholderClassName : '',
  ].filter(Boolean).join(' ');

  const setCardEl = (el: HTMLDivElement | null) => {
    cardRefProp?.(el);
    drag?.ref(el);
  };

  const rolePickerLabel = t('cooling.fanRole.picker');

  // NP50 lists only FW Control (no BIOS hand-off); a Q-series pump lists both;
  // everything else lists only BIOS. Modes only - Lock and Nexus Control are
  // states rather than modes and live in the card's overflow menu, which is
  // what keeps this dropdown narrow.
  const baseModeOptions: SelectOption[] = [
    ...(hubSupportsFirmware ? [{ value: 'fw', label: t('cooling.card.firmware') }] : []),
    ...(hubSupportsBios ? [{ value: 'bios', label: t('cooling.card.bios') }] : []),
    { value: 'manual', label: t('cooling.card.manual') },
    ...curves.map(c => ({ value: c.id, label: c.name })),
    ...(canCreateCurve ? [
      { value: '__sep__', label: '', divider: true },
      { value: '__create__', label: t('cooling.card.createCurve'), className: styles.fanModeOptionCreate, icon: <Plus size={14} /> },
    ] : []),
  ];
  // Select renders the selected option's icon in its trigger, so hanging the
  // lock on the current mode is what puts it inside the dropdown ("[lock]
  // Silent"). The fan icon no longer carries it.
  const modeOptions: SelectOption[] = locked
    ? baseModeOptions.map(o => o.value === modeValue ? { ...o, icon: <Lock size={14} /> } : o)
    : baseModeOptions;

  const handleModeChange = (v: string) => {
    if (v === '__create__') { onCreateCurve(); return; }
    onSetMode(v);
  };

  // Overflow menu, mirroring the lighting device card: a right-click anywhere
  // on the card and the trailing button both open it.
  const menuItems = (): DeviceMenuItem[] => {
    const items: DeviceMenuItem[] = [];
    // Leads the menu and names the fan, so it is unambiguous which card the
    // selection is about to narrow to. Matches the lighting card, including
    // the rule under it.
    if (clickable && selected && !bulk && onSelect) {
      // Narrowing to this card is pointless when it IS the whole selection.
      items.push({
        key: 'deselect',
        icon: <MousePointerClick size={14} />,
        label: t('cooling.fan.deselect'),
        onSelect: () => onSelect(true),
        separatorAfter: true,
      });
    } else if (onSelectOnly && clickable) {
      items.push({
        key: 'selectOnly',
        icon: <MousePointerClick size={14} />,
        label: t('cooling.fan.selectOnly', { name: channel.name }),
        onSelect: onSelectOnly,
        separatorAfter: true,
      });
    }
    // Aggregates read "any member still is", so one press lands the whole
    // selection on the same state.
    const isLocked = bulk ? bulk.locked : locked;
    const isControlled = bulk ? bulk.controlled : controlled;
    const setLocked = (next: boolean) => bulk ? bulk.setLocked(next) : onToggleLock(channel.id, next);
    const label = (single: string, counted: string) => bulkMenuLabel(t, language, bulk, single, counted);

    if (isControlled) {
      items.push(isLocked
        ? { key: 'lock', icon: <LockOpen size={14} />, label: label('cooling.lock.unlock', 'cooling.lock.unlockCount'), onSelect: () => setLocked(false) }
        : { key: 'lock', icon: <Lock size={14} />, label: label('cooling.lock.lock', 'cooling.lock.lockCount'), onSelect: () => setLocked(true) });
      // An offset belongs to one fan, so a selection has nothing to clear -
      // the same rule the lighting menu applies to the LED map row.
      if (!bulk && offset !== 0 && onClearOffset) {
        items.push({ key: 'clearOffset', icon: <RotateCcw size={14} />, label: t('cooling.card.clearOffset'), onSelect: () => onClearOffset(channel.id) });
      }
    }
    if (onToggleControlled) {
      const setControlled = (next: boolean) => bulk ? bulk.setControlled(next) : onToggleControlled(channel.id, next);
      // The menu only offers separatorAfter, so the rule is set on the row
      // above rather than the Nexus Control row itself.
      if (items.length > 0) items[items.length - 1] = { ...items[items.length - 1], separatorAfter: true };
      items.push(isControlled
        ? { key: 'controlled', icon: <Unlink size={14} />, label: label('cooling.fan.menuControlOff', 'cooling.fan.menuControlOffCount'), onSelect: () => setControlled(false) }
        // Highlighted for the same reason the lighting card highlights it: it
        // is the row that un-sticks the card's current state.
        : { key: 'controlled', icon: <Link size={14} />, label: label('cooling.fan.menuControlOn', 'cooling.fan.menuControlOnCount'), onSelect: () => setControlled(true), highlighted: true });
    }
    // Naming and grouping close the menu, under a rule: they change what the
    // fan IS, where everything above acts on what it does.
    const organise: DeviceMenuItem[] = [];
    if (!bulk) {
      organise.push({
        key: 'rename',
        icon: <Pencil size={14} />,
        label: t('cooling.fan.rename'),
        onSelect: () => nameRef.current?.startEditing(),
      });
      // Clearing a rename has no inline affordance - an empty commit is
      // dropped - so the menu is the only way back to the hardware name.
      if (channel.originalName != null) {
        organise.push({
          key: 'resetName',
          icon: <RotateCcw size={14} />,
          label: t('cooling.fan.resetName'),
          onSelect: () => onRename(channel.id, ''),
        });
      }
    }
    const groupRows: DeviceMenuItem[] = [];
    if (!bulk && groupMove) {
      for (const target of groupMove.targets) {
        groupRows.push({
          key: `group:${target.id}`, icon: <Folder size={14} />, label: target.name,
          onSelect: () => groupMove.onMove(target.id),
        });
      }
      if (groupMove.onMoveToNew) {
        if (groupRows.length > 0) groupRows[groupRows.length - 1].separatorAfter = true;
        groupRows.push({
          key: 'group:new', icon: <FolderPlus size={14} />,
          label: t('cooling.fan.moveToNewGroup'), onSelect: groupMove.onMoveToNew,
        });
      }
      if (groupMove.onRemove) {
        if (groupRows.length > 0) groupRows[groupRows.length - 1].separatorAfter = true;
        groupRows.push({
          key: 'group:none', icon: <FolderMinus size={14} />,
          label: t('cooling.fan.removeFromGroup', { name: groupMove.onRemove.name }),
          onSelect: groupMove.onRemove.run,
        });
      }
    }
    if (groupRows.length > 0) {
      organise.push({
        key: 'moveToGroup', icon: <FolderInput size={14} />,
        label: t('cooling.fan.moveToGroup'), submenu: groupRows,
      });
    }
    if (organise.length > 0) {
      if (items.length > 0) items[items.length - 1].separatorAfter = true;
      items.push(...organise);
    }
    return items;
  };
  // A hardware-dead channel has no state worth changing, and a read-only one
  // exposes no controls at all.
  const menuEnabled = !isHwDisconnected && !isReadOnly && menuItems().length > 0;

  // The lock normally rides the selected mode option's icon, so a branch with
  // no dropdown (disconnected, fixed, read-only, Nexus Control off) would show
  // no lock at all - and the menu still offers Lock/Unlock there. Carry it
  // beside the state badge in those rows instead.
  const lockGlyph = locked ? <Lock size={12} className={styles.fanLockGlyph} aria-hidden="true" /> : null;

  // Shares the mode control's row rather than the card's full height, so the
  // space it takes comes out of the dropdown's width and the card keeps its
  // original height.
  const menuButton = menuEnabled ? (
    <div className={styles.fanCardActions} data-no-dnd>
      <HoverTooltip body={t('cooling.fan.moreActions')} side="top">
        <button
          type="button"
          className={styles.fanMenuBtn}
          aria-label={t('cooling.fan.moreActions')}
          onClick={e => {
            e.stopPropagation();
            // Explicit toggle: the button is its own close affordance, and the
            // menu's outside-pointerdown close has already run.
            if (menuAt) { setMenuAt(null); return; }
            const r = e.currentTarget.getBoundingClientRect();
            openMenu(r.right, r.bottom + 4);
          }}
        >
          <MoreVertical />
        </button>
      </HoverTooltip>
    </div>
  ) : null;

  return (
    <div
      ref={setCardEl}
      style={drag?.style ?? {}}
      {...(drag?.attributes ?? {})}
      {...(drag?.listeners ?? {})}
      className={`${styles.fanCard} ${selected ? styles.fanCardSelected : ''} ${calibrating ? styles.fanCardCalibrating : ''} ${roleMenuOpen ? styles.fanCardMenuOpen : ''} ${dragClasses}`}
      onClick={onSelect ? e => {
        // Controls inside the card own their own clicks; only bare card
        // surface toggles selection. Matched via the same [data-no-dnd] marker
        // the drag sensor honours - NOT [role="button"], which dnd-kit puts on
        // the card root itself, so that guard swallowed every click.
        const target = e.target as HTMLElement;
        // React events bubble through the COMPONENT tree, so a click inside a
        // portaled dropdown menu reaches this handler even though the menu is
        // not a DOM descendant - which flipped the card's selection every time
        // a curve was picked. Anything outside the card is not ours.
        if (!e.currentTarget.contains(target)) return;
        if (target.closest('[data-no-dnd],button,input,select,textarea,a')) return;
        if (!clickable) return;
        onSelect(isMultiSelectModifier(e));
      } : undefined}
      onMouseEnter={onWireHover ? () => onWireHover(channel.id) : undefined}
      onMouseLeave={onWireHover ? () => onWireHover(null) : undefined}
      onContextMenu={menuEnabled ? e => {
        // The menu is portaled, so its own right-clicks still bubble through
        // the component tree and would reopen it at the new coords. Same guard
        // the card's onClick carries.
        if (!e.currentTarget.contains(e.target as HTMLElement)) return;
        e.preventDefault();
        e.stopPropagation();
        openMenu(e.clientX, e.clientY);
      } : undefined}
    >
      <div className={styles.fanCardBody}>
      <div className={styles.fanCardHeader}>
        {/* Fan icon opens the device-role picker (Generic fan / CPU / GPU) and
            reflects the current role. Lock is shown inside the mode dropdown,
            not here. When this fan is bound to the curve shown in the graph,
            the highlight lives on the dropdown value (accentValue). */}
        <div ref={roleAnchorRef} className={styles.fanRoleAnchor} data-no-dnd={isReadOnly ? undefined : true}>
          <HoverTooltip body={rolePickerLabel} side="top">
            {isReadOnly ? (
              <span className={styles.fanKindToggle} role="img" aria-label={rolePickerLabel}>
                <RoleIcon size={18} className={styles.fanKindIcon} aria-hidden="true" />
              </span>
            ) : (
              <button
                type="button"
                className={`${styles.fanKindToggle} ${styles.fanLockToggle}`}
                aria-haspopup="menu"
                aria-expanded={roleMenuOpen}
                aria-label={rolePickerLabel}
                onClick={() => setRoleMenuOpen(o => !o)}
              >
                <RoleIcon size={18} className={styles.fanKindIcon} aria-hidden="true" />
              </button>
            )}
          </HoverTooltip>
          {!isReadOnly && (
            <Popover
              open={roleMenuOpen}
              onClose={() => setRoleMenuOpen(false)}
              anchorRef={roleAnchorRef}
              placement="bottom-start"
              role="menu"
              ariaLabel={rolePickerLabel}
            >
              {roleChoices.map(choice => (
                <button
                  key={choice.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={choice.value === role}
                  className={`${styles.fanRoleOption}${choice.value === role ? ` ${styles.fanRoleOptionActive}` : ''}`}
                  onClick={() => {
                    if (choice.value !== role) onSetRole(channel.id, choice.value);
                    setRoleMenuOpen(false);
                  }}
                >
                  <choice.Icon size={14} aria-hidden="true" />
                  {choice.label}
                </button>
              ))}
            </Popover>
          )}
        </div>
        {/* display:contents span carries data-no-dnd onto a real DOM node
            (EditableText doesn't forward unknown props) so a press on the name
            edits it instead of starting a card drag; no layout change. */}
        <span data-no-dnd style={{ display: 'contents' }}>
          {/* Rename lives on the context menu; a click on the name belongs to the card. */}
          <EditableText ref={nameRef} value={channel.name} onCommit={name => onRename(channel.id, name)} className={styles.editableName} clickToEdit={false} maxLength={DEVICE_NAME_MAX_LENGTH} />
        </span>
        {channel.rpmUnavailable ? (
          <HoverTooltip body={t('cooling.fan.rpmUnavailableHint')}>
            <span className={styles.fanRpmReadout}>
              <GaugeCircle size={12} aria-hidden="true" />
              <span className={styles.fanRpmLabel}>{t('cooling.fan.rpmUnavailable')}</span>
            </span>
          </HoverTooltip>
        ) : (
          <span className={styles.fanRpmReadout}>
            <span className={styles.fanRpm}>{formatNumber(channel.rpm, numberFormat)}</span>
            <span className={styles.fanRpmLabel}>RPM</span>
          </span>
        )}
      </div>

      {offset !== 0 && (
        <div className={styles.fanOffsetBadge}>
          <Badge
            label={t('cooling.fan.offsetBadge', { value: offset > 0 ? `+${offset}` : String(offset) })}
            compact uppercase color="var(--text-dim)"
          />
        </div>
      )}

      {isHwDisconnected || !controlled ? (
        // Hardware unresponsive, or the user handed the channel away: the whole
        // fan block is "off", so the badge replaces the duty bar and the mode
        // dropdown. Nothing here would drive the channel, and leaving a live
        // dropdown would imply otherwise.
        <div className={styles.fanModeRow}>
          <div className={styles.fanStateBadge}>
            <Badge label={stateBadge!.label} icon={stateBadge!.icon} compact uppercase color="var(--text-dim)" />
          </div>
          {lockGlyph}
          {menuButton}
        </div>
      ) : isReadOnly ? null : isFixed ? (
        // Fixed speed: the RPM readout stays in the header and the duty bar
        // goes. No mode dropdown at all - nothing here can drive a fan whose
        // header ignores PWM.
        <div className={styles.fanModeRow}>
          <HoverTooltip body={t('cooling.fan.fixedHint')} side="top">
            <div className={styles.fanStateBadge}>
              <Badge label={stateBadge!.label} icon={stateBadge!.icon} compact uppercase color="var(--text-dim)" />
            </div>
          </HoverTooltip>
          {lockGlyph}
          {menuButton}
        </div>
      ) : (
        <>
          <div
            ref={barRef}
            className={`${styles.fanDutyBar} ${isManual ? styles.fanDutyBarManual : ''}`}
            draggable={false}
            data-no-dnd
            onPointerDown={onBarPointerDown}
            onPointerMove={onBarPointerMove}
            onPointerUp={onBarPointerUp}
          >
            {/* Wire nub lives inside the duty bar so its vertical center
                tracks the bar's center automatically. Gated on hardware
                responsiveness via the parent block; nothing to wire to on
                an unresponsive channel. */}
            {onWirePointerDown && (
              <HoverTooltip body={t('cooling.wire.dragHint')} side="top">
                <div
                  ref={nubRef}
                  className={`${styles.fanInNub}${assignedCurveId ? ' ' + styles.nubConnected : ''}`}
                  aria-hidden="true"
                  onPointerDown={onWirePointerDown}
                />
              </HoverTooltip>
            )}
            {isManual ? (
              <>
                <div className={styles.fanDutyFillActual} style={{ width: `${dutyPct}%` }} />
                <div className={styles.fanDutyFillTarget} style={{ width: `${targetPct}%` }} />
                <div className={styles.fanDutyKnob} style={{ left: `${targetPct}%` }} />
              </>
            ) : (
              <div className={styles.fanDutyFill} style={{ width: `${dutyPct}%` }} />
            )}
          </div>

          {/* Mode dropdown is always present when the hardware is responsive.
              Default (boxed) Select chrome, matching the app settings
              dropdowns; binding a curve here is how a fan picks its curve. */}
          {/* Same display:contents data-no-dnd guard as the name editor. */}
          <div className={styles.fanModeRow}>
            <span data-no-dnd style={{ display: 'contents' }}>
            <Select
              className={highlighted ? `${styles.fanModeSelect} ${styles.fanModeSelectAccent}` : styles.fanModeSelect}
              accentValue={highlighted}
              value={modeValue}
              onChange={handleModeChange}
              ariaLabel={t('cooling.card.mode')}
              options={modeOptions}
            />
            </span>
            {menuButton}
          </div>
        </>
      )}
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
    </div>
  );
});

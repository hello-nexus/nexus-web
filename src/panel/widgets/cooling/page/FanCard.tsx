import { memo, useEffect, useRef, useState } from 'react';
import { isMultiSelectModifier } from '../../../../lib/platform';
import { Check, CircleSlash, Cpu, Fan, Gpu, Lock, Plus } from 'lucide-react';
import { type FanChannel, type FanRole, isFanDisconnected } from '../../../../api/cooling';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { formatNumber } from '../../../../lib/units';
import type { CurveDef, FanState } from '../../../../types/cooling';
import { EditableText } from '../../../../components/common/Editable/EditableText';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Popover } from '../../../../components/common/Popover/Popover';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
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
 * Motherboard fans (no deviceId) leave this undefined.
 */
export type FanCardHubMode = 'software' | 'motherboard' | 'firmware';

export const FanCard = memo(function FanCard({
  channel, state, curves, calibrating, compact, canCreateCurve = true, highlighted,
  selected = false, onToggleSelect, onSelect,
  hubMode, hubSupportsFirmware,
  hubSupportsBios = true,
  nubRef, cardRef: cardRefProp, onWirePointerDown, onWireHover,
  onSetMode, onCreateCurve, onRename, onSpeedChange, onToggleLock, onSetRole, drag,
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
  /** Omitted where the card is not selectable (no checkbox renders then). */
  onToggleSelect?: (id: string) => void;
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
  onSetRole: (id: string, role: FanRole) => void;
  drag?: SortableRowArgs;
}) {
  const { t } = useTranslation();
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
  const locked = channel.locked ?? false;
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
    isHwDisconnected || isFixed ? styles.fanCardOff : '',
    drag?.isDragging ? drag.placeholderClassName : '',
  ].filter(Boolean).join(' ');

  const setCardEl = (el: HTMLDivElement | null) => {
    cardRefProp?.(el);
    drag?.ref(el);
  };

  // Select has no persistent checkbox, so the row names the action it performs.
  const lockOptionLabel = locked ? t('cooling.lock.unlock') : t('cooling.lock.lock');
  const rolePickerLabel = t('cooling.fanRole.picker');
  // Locked state shows only as the badge, so the icon tooltip carries its meaning.
  const fanIconTooltip = locked ? t('cooling.lock.lockedHint') : rolePickerLabel;

  // NP50 lists only FW Control (no BIOS hand-off); a Q-series pump lists both;
  // everything else lists only BIOS. The create-curve action and the Lock
  // toggle each sit below a thin rule separator, matching the lighting preset
  // and Profile dropdowns.
  const modeOptions: SelectOption[] = [
    ...(hubSupportsFirmware ? [{ value: 'fw', label: t('cooling.card.firmware') }] : []),
    ...(hubSupportsBios ? [{ value: 'bios', label: t('cooling.card.bios') }] : []),
    { value: 'manual', label: t('cooling.card.manual') },
    ...curves.map(c => ({ value: c.id, label: c.name })),
    ...(canCreateCurve ? [
      { value: '__sep__', label: '', divider: true },
      { value: '__create__', label: t('cooling.card.createCurve'), className: styles.fanModeOptionCreate, icon: <Plus size={14} /> },
    ] : []),
    { value: '__lockSep__', label: '', divider: true },
    { value: '__lock__', label: lockOptionLabel, icon: <Lock size={14} /> },
  ];

  const handleModeChange = (v: string) => {
    if (v === '__create__') { onCreateCurve(); return; }
    if (v === '__lock__') { onToggleLock(channel.id, !locked); return; }
    onSetMode(v);
  };

  return (
    <div
      ref={setCardEl}
      style={drag?.style ?? {}}
      {...(drag?.attributes ?? {})}
      {...(drag?.listeners ?? {})}
      className={`${styles.fanCard} ${calibrating ? styles.fanCardCalibrating : ''} ${dragClasses}`}
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
        onSelect(isMultiSelectModifier(e));
      } : undefined}
      onMouseEnter={onWireHover ? () => onWireHover(channel.id) : undefined}
      onMouseLeave={onWireHover ? () => onWireHover(null) : undefined}
    >
      {onToggleSelect && !isReadOnly && (
        <span
          className={`${styles.fanCheck} ${selected ? styles.fanCheckOn : ''}`}
          role="checkbox"
          aria-checked={selected}
          aria-label={channel.name}
          tabIndex={0}
          data-no-dnd
          onClick={e => { e.stopPropagation(); onToggleSelect(channel.id); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggleSelect(channel.id); }
          }}
        >
          {selected && <Check aria-hidden />}
        </span>
      )}
      {/* Everything but the checkbox stacks in here, so the box sits centred
          against the whole card the way the lighting rail's does. */}
      <div className={styles.fanCardBody}>
      <div className={styles.fanCardHeader}>
        {/* Fan icon opens the device-role picker (Generic fan / CPU / GPU) and
            reflects the current role; the lock badge/dim visual rides on it
            while the lock toggle itself lives in the mode dropdown. When this
            fan is bound to the curve shown in the graph, the highlight lives on
            the dropdown value (accentValue) instead of the icon. */}
        <div ref={roleAnchorRef} className={styles.fanRoleAnchor} data-no-dnd={isReadOnly ? undefined : true}>
          <HoverTooltip body={fanIconTooltip} side="top">
            {isReadOnly ? (
              <span className={styles.fanKindToggle} role="img" aria-label={rolePickerLabel}>
                <RoleIcon size={18} className={locked ? `${styles.fanKindIcon} ${styles.fanKindIconDim}` : styles.fanKindIcon} aria-hidden="true" />
                {locked && <Lock size={14} className={styles.fanLockBadge} aria-hidden="true" />}
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
                <RoleIcon size={18} className={locked ? `${styles.fanKindIcon} ${styles.fanKindIconDim}` : styles.fanKindIcon} aria-hidden="true" />
                {locked && <Lock size={14} className={styles.fanLockBadge} aria-hidden="true" />}
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
          <EditableText value={channel.name} onCommit={name => onRename(channel.id, name)} className={styles.editableName} />
        </span>
        <span className={styles.fanRpmReadout}>
          <span className={styles.fanRpm}>{formatNumber(channel.rpm, numberFormat)}</span>
          <span className={styles.fanRpmLabel}>RPM</span>
        </span>
      </div>

      {isHwDisconnected ? (
        // Hardware unresponsive: the entire fan block is "off". Single
        // marker replaces the duty bar and the mode dropdown.
        <div className={styles.fanBindingDisconnected}>
          <span>{t('cooling.fan.disconnected')}</span>
        </div>
      ) : isReadOnly ? null : isFixed ? (
        // Fixed speed: keep the RPM readout in the header and swap the duty
        // bar for a "Fixed speed" marker. No mode dropdown at all - nothing
        // here can drive a fan whose header ignores PWM.
        <HoverTooltip body={t('cooling.fan.fixedHint')} side="top">
          <div className={styles.fanBindingDisconnected}>
            <CircleSlash size={13} aria-hidden="true" />
            <span>{t('cooling.fan.fixed')}</span>
          </div>
        </HoverTooltip>
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
          <span data-no-dnd style={{ display: 'contents' }}>
          <Select
            className={highlighted ? `${styles.fanModeSelect} ${styles.fanModeSelectAccent}` : styles.fanModeSelect}
            variant="ghost"
            accentValue={highlighted}
            value={modeValue}
            onChange={handleModeChange}
            ariaLabel={t('cooling.card.mode')}
            options={modeOptions}
          />
          </span>
        </>
      )}
      </div>
    </div>
  );
});

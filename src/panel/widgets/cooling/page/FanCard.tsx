import { memo, useRef, useState } from 'react';
import { Fan, Lock, Plus } from 'lucide-react';
import type { FanChannel } from '../../../../api/cooling';
import { useTranslation } from '../../../../lib/i18n';
import type { CurveDef, FanState } from '../../../../types/cooling';
import { EditableText } from '../../../../components/common/Editable/EditableText';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import { type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import styles from '../CoolingPage.module.scss';

/**
 * One fan card, styled to match the lighting page's device cards: editable
 * name on top, the live RPM as an icon + value on the right (like the LED
 * count), a thin duty bar, and the mode dropdown (BIOS / Manual / curves /
 * Create curve). Wire DnD also binds / unbinds when a wire layer is present.
 *
 * When the fan hardware itself is unresponsive (calibration classification
 * = "Unresponsive"), the card collapses to a single "Disconnected" marker
 * and hides the duty bar + dropdown - nothing here can drive the channel.
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
  hubMode, hubSupportsFirmware,
  hubSupportsBios = true,
  nubRef, cardRef: cardRefProp, onWirePointerDown, onWireHover,
  onSetMode, onCreateCurve, onRename, onSpeedChange, onToggleLock, drag,
}: {
  channel: FanChannel;
  state: FanState | undefined;
  curves: CurveDef[];
  calibrating?: boolean;
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
  drag?: SortableRowArgs;
}) {
  const { t } = useTranslation();
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
  const isHwDisconnected = channel.classification === 'Unresponsive';
  // Telemetry-only channel (Q-series pump today): header readout only, no duty
  // bar or mode dropdown - nothing here drives it.
  const isReadOnly = channel.readOnly ?? false;
  const locked = channel.locked ?? false;

  const [manualTarget, setManualTarget] = useState(channel.mode === 'Manual' ? channel.dutyPercent : 50);
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const speedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSpeedRef = useRef<number | null>(null);

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
    driven ? styles.fanCardActive : '',
    compact ? styles.fanCardCompact : '',
    isHwDisconnected ? styles.fanCardOff : '',
    locked ? styles.fanCardLocked : '',
    drag?.isDragging ? drag.placeholderClassName : '',
  ].filter(Boolean).join(' ');

  const setCardEl = (el: HTMLDivElement | null) => {
    cardRefProp?.(el);
    drag?.ref(el);
  };

  const lockTooltip = locked ? t('cooling.lock.locked') : t('cooling.lock.unlocked');

  // NP50 lists only FW Control (no BIOS hand-off); a Q-series pump lists both;
  // everything else lists only BIOS. The create-curve action sits below a thin
  // rule separator, matching the lighting preset and Profile dropdowns.
  const modeOptions: SelectOption[] = [
    ...(hubSupportsFirmware ? [{ value: 'fw', label: t('cooling.card.firmware') }] : []),
    ...(hubSupportsBios ? [{ value: 'bios', label: t('cooling.card.bios') }] : []),
    { value: 'manual', label: t('cooling.card.manual') },
    ...curves.map(c => ({ value: c.id, label: c.name })),
    ...(canCreateCurve ? [
      { value: '__sep__', label: '', divider: true },
      { value: '__create__', label: t('cooling.card.createCurve'), className: styles.fanModeOptionCreate, icon: <Plus size={14} /> },
    ] : []),
  ];

  return (
    <div
      ref={setCardEl}
      style={drag?.style ?? {}}
      {...(drag?.attributes ?? {})}
      {...(drag?.listeners ?? {})}
      className={`${styles.fanCard} ${calibrating ? styles.fanCardCalibrating : ''} ${dragClasses}`}
      onMouseEnter={onWireHover ? () => onWireHover(channel.id) : undefined}
      onMouseLeave={onWireHover ? () => onWireHover(null) : undefined}
    >
      <div className={styles.fanCardHeader}>
        {/* Fan icon doubles as the lock toggle: click to exclude this fan
            from the global preset buttons (still settable from the mode
            dropdown below). When this fan is bound to the curve currently
            shown in the graph, the highlight lives on the dropdown value
            (accentValue) instead of the icon. */}
        <HoverTooltip body={lockTooltip} side="top">
          {isReadOnly ? (
            <span className={styles.fanKindToggle} role="img" aria-label={lockTooltip}>
              <Fan size={18} className={styles.fanKindIcon} aria-hidden="true" />
              {locked && <Lock size={10} className={styles.fanLockBadge} aria-hidden="true" />}
            </span>
          ) : (
            <button
              type="button"
              data-no-dnd
              className={`${styles.fanKindToggle} ${styles.fanLockToggle}`}
              aria-pressed={locked}
              aria-label={lockTooltip}
              onClick={() => onToggleLock(channel.id, !locked)}
            >
              <Fan size={18} className={styles.fanKindIcon} aria-hidden="true" />
              {locked && <Lock size={10} className={styles.fanLockBadge} aria-hidden="true" />}
            </button>
          )}
        </HoverTooltip>
        {/* display:contents span carries data-no-dnd onto a real DOM node
            (EditableText doesn't forward unknown props) so a press on the name
            edits it instead of starting a card drag; no layout change. */}
        <span data-no-dnd style={{ display: 'contents' }}>
          <EditableText value={channel.name} onCommit={name => onRename(channel.id, name)} className={styles.editableName} />
        </span>
        <span className={styles.fanRpmReadout}>
          <span className={styles.fanRpm}>{channel.rpm.toLocaleString()}</span>
          <span className={styles.fanRpmLabel}>RPM</span>
        </span>
      </div>

      {isHwDisconnected ? (
        // Hardware unresponsive: the entire fan block is "off". Single
        // marker replaces the duty bar and the mode dropdown.
        <div className={styles.fanBindingDisconnected}>
          <span>{t('cooling.fan.disconnected')}</span>
        </div>
      ) : isReadOnly ? null : (
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
                <div className={styles.fanDutyFillTarget} style={{ width: `${manualTarget}%` }} />
                <div className={styles.fanDutyKnob} style={{ left: `${manualTarget}%` }} />
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
            onChange={v => {
              if (v === '__create__') { onCreateCurve(); return; }
              onSetMode(v);
            }}
            ariaLabel={t('cooling.card.mode')}
            options={modeOptions}
          />
          </span>
        </>
      )}
    </div>
  );
});

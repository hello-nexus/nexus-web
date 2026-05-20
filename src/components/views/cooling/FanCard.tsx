import { memo, useRef, useState } from 'react';
import type { FanChannel } from '../../../api/cooling';
import { useTranslation } from '../../../lib/i18n';
import type { CurveDef, FanState } from '../../../types/cooling';
import { EditableText } from '../../common/Editable/EditableText';
import { Select } from '../../common/Select/Select';
import styles from '../CoolingView.module.scss';

export interface FanCardDrag {
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

/**
 * One fan card: editable name + live RPM on the header, duty bar below, and
 * the mode dropdown (BIOS / Manual / curves / Create curve). Wire DnD also
 * binds / unbinds; disconnecting a wire reverts the fan to BIOS.
 *
 * When the fan hardware itself is unresponsive (calibration classification
 * = "Unresponsive"), the card collapses to a single "Disconnected" marker
 * and hides the duty bar, dropdown and wire nub - nothing here can drive
 * the channel until the hardware comes back.
 */
export const FanCard = memo(function FanCard({
  channel, state, curves, calibrating, compact, canCreateCurve = true, highlighted,
  nubRef, cardRef: cardRefProp, onWirePointerDown, onWireHover,
  onSetMode, onCreateCurve, onRename, onSpeedChange, drag,
}: {
  channel: FanChannel;
  state: FanState | undefined;
  curves: CurveDef[];
  calibrating?: boolean;
  /** Sidebar layout: 100% width, tighter padding, smaller RPM readout. Used by the cooling page's right-side fan list. */
  compact?: boolean;
  /** When false, the mode dropdown hides the "Create curve" option (curve cap reached). */
  canCreateCurve?: boolean;
  /** Visual emphasis - this fan is on the currently-hovered or expanded
   *  wire path. Tracks the same condition as the wire-layer highlight so
   *  the connected pair lights up together. */
  highlighted?: boolean;
  /** Ref handed to the input nub so the wire SVG can read its bbox. */
  nubRef?: (el: HTMLDivElement | null) => void;
  /** Ref handed to the card root so the wire DnD hit-test can treat the
   *  whole fan card as a drop target. */
  cardRef?: (el: HTMLDivElement | null) => void;
  /** Pointer-down on the input nub starts a wire drag. */
  onWirePointerDown?: (e: React.PointerEvent) => void;
  /** Card hover in/out so the wire layer can highlight just the wire
   *  connected to this fan, and the curve on the other end can paint its
   *  border. Pass null on leave. */
  onWireHover?: (id: string | null) => void;
  onSetMode: (value: string) => void;
  onCreateCurve: () => void;
  onRename: (id: string, name: string) => void;
  onSpeedChange: (id: string, speed: number) => void;
  drag?: FanCardDrag;
}) {
  const { t } = useTranslation();
  const dutyPct = Math.max(0, Math.min(100, channel.dutyPercent));
  const swEnabled = state?.softwareControl ?? false;
  const assignedCurveId = state?.curveId ?? '';
  const isManual = swEnabled && !assignedCurveId;
  const modeValue = !swEnabled ? 'bios' : (assignedCurveId || 'manual');
  // Hardware-level disconnect (no tach, no controllable duty). When true the
  // card collapses to a single "Disconnected" marker; the dropdown and duty
  // bar disappear because nothing the user does here will drive the channel.
  const isHwDisconnected = channel.classification === 'Unresponsive';

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
    drag?.isDragging ? styles.fanCardDragging : '',
    drag?.isDragOver ? styles.fanCardDragOver : '',
    assignedCurveId ? styles.fanCardActive : '',
    compact ? styles.fanCardCompact : '',
    isHwDisconnected ? styles.fanCardOff : '',
    highlighted ? styles.fanCardHighlighted : '',
  ].filter(Boolean).join(' ');

  // Selector list for "foreground controls win" gating. Anything matching
  // this in the mousedown target's ancestry blocks card reorder so the
  // child gesture (duty bar drag, name editor, wire nub) keeps the pointer.
  const interactiveSelector =
    'input, select, textarea, button, label, ' +
    '[role="button"], [role="slider"], [role="switch"], ' +
    `.${styles.fanDutyBar}, .${styles.editableName}, .${styles.fanInNub}`;

  const cardRef = useRef<HTMLDivElement>(null);
  const setCardEl = (el: HTMLDivElement | null) => {
    cardRef.current = el;
    cardRefProp?.(el);
  };

  return (
    <div
      ref={setCardEl}
      className={`${styles.fanCard} ${calibrating ? styles.fanCardCalibrating : ''} ${dragClasses}`}
      draggable={!calibrating && !!drag}
      onMouseDownCapture={drag ? (e) => {
        // Toggle native draggable BEFORE the browser starts its drag
        // tracking. With draggable=false at mousedown time, HTML5 drag
        // never initiates - the slider/native form element keeps the
        // pointer for its own gesture.
        const target = e.target as HTMLElement;
        const interactive = !!target.closest(interactiveSelector);
        if (cardRef.current) {
          cardRef.current.draggable = !calibrating && !interactive;
        }
      } : undefined}
      onDragStart={drag ? (e) => {
        // Belt + suspenders: even if the draggable toggle doesn't catch a
        // particular browser/host, the dragstart gate cancels any drag
        // whose source is inside an interactive child.
        const target = e.target as HTMLElement;
        if (target.closest(interactiveSelector)) {
          e.preventDefault();
          return;
        }
        drag.onDragStart();
      } : undefined}
      onDragOver={drag ? (e) => { e.preventDefault(); drag.onDragOver(); } : undefined}
      onDragLeave={drag ? drag.onDragLeave : undefined}
      onDrop={drag ? drag.onDrop : undefined}
      onDragEnd={drag ? drag.onDragEnd : undefined}
      onMouseEnter={onWireHover ? () => onWireHover(channel.id) : undefined}
      onMouseLeave={onWireHover ? () => onWireHover(null) : undefined}
    >
      <div className={styles.fanCardHeader}>
        <EditableText value={channel.name} onCommit={name => onRename(channel.id, name)} className={styles.editableName} />
        {/* The small Unresponsive badge in the header is dropped when the
            full-width "Disconnected" marker is shown below; one indicator is
            enough. */}
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
      ) : (
        <>
          <div
            ref={barRef}
            className={`${styles.fanDutyBar} ${isManual ? styles.fanDutyBarManual : ''}`}
            // Stop drag from latching onto the slider so manual duty drag
            // and card reorder don't compete for the same pointer.
            draggable={false}
            onPointerDown={onBarPointerDown}
            onPointerMove={onBarPointerMove}
            onPointerUp={onBarPointerUp}
          >
            {/* Wire nub lives inside the duty bar so its vertical center
                tracks the bar's center automatically. Gated on hardware
                responsiveness via the parent block; nothing to wire to on
                an unresponsive channel. */}
            {onWirePointerDown && (
              <div
                ref={nubRef}
                className={`${styles.fanInNub}${assignedCurveId ? ' ' + styles.nubConnected : ''}`}
                title={t('cooling.wire.dragHint')}
                aria-hidden="true"
                onPointerDown={onWirePointerDown}
              />
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

          {/* Mode dropdown is always present when the hardware is responsive,
              regardless of whether a wire is currently connected. Disconnect-
              ing a wire reverts to BIOS via setFanMode('bios'); this dropdown
              is the keyboard-friendly path to the same transition. */}
          <Select
            className={styles.fanModeSelect}
            variant="ghost"
            value={modeValue}
            onChange={v => {
              if (v === '__create__') { onCreateCurve(); return; }
              onSetMode(v);
            }}
            ariaLabel={t('cooling.card.mode')}
          >
            <option value="bios">{t('cooling.card.bios')}</option>
            <option value="manual">{t('cooling.card.manual')}</option>
            {curves.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            {canCreateCurve && (
              <option value="__create__" className={styles.fanModeOptionCreate}>
                {t('cooling.card.createCurve')}
              </option>
            )}
          </Select>
        </>
      )}
    </div>
  );
});

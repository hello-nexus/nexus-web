import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../common/Button/Button';
import { SettingRow, SettingSlider, type SettingState } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getHydroShift2CurveHead,
  recalibrateHydroShift2CurveHead,
  setHydroShift2CurveHead,
  type HydroShift2CurveHead,
  type HydroShift2CurveHeadPatch,
} from '../../../api/hydroshift2Curve';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';

const POLL_MS = 1000;

type Axis = 'tilt' | 'slide';
const AXES: Axis[] = ['tilt', 'slide'];

/** The HydroShift II Curved pump head: tilt angle and height, plus end-stop recalibration. */
export function HydroShift2CurveHeadSettings() {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [head, setHead] = useState<HydroShift2CurveHead | null>(null);
  const aliveRef = useRef(true);
  // An axis is dirty while dragged or from commit until a poll reports that target.
  const draggingRef = useRef<Record<Axis, boolean>>({ tilt: false, slide: false });
  const pendingRef = useRef<Record<Axis, number | null>>({ tilt: null, slide: null });
  const inFlightRef = useRef<Record<Axis, number | null>>({ tilt: null, slide: null });
  const polledRef = useRef<Record<Axis, number | null>>({ tilt: null, slide: null });
  const issuedRef = useRef(0);
  const appliedRef = useRef(0);
  // Polls issued up to this id predate the latest finished PUT and may carry the old target.
  const putDoneRef = useRef(0);

  const refresh = useCallback(async () => {
    const issued = ++issuedRef.current;
    const h = await getHydroShift2CurveHead();
    if (!aliveRef.current || !h) return;
    if (issued < appliedRef.current || issued <= putDoneRef.current) return;
    appliedRef.current = issued;
    if (h.calibrating || !h.connected) {
      for (const axis of AXES) {
        draggingRef.current[axis] = false;
        pendingRef.current[axis] = null;
      }
    }
    polledRef.current = { tilt: h.targetTilt, slide: h.targetSlide };
    if (pendingRef.current.tilt === h.targetTilt) pendingRef.current.tilt = null;
    if (pendingRef.current.slide === h.targetSlide) pendingRef.current.slide = null;
    const dirty = (axis: Axis) => draggingRef.current[axis] || pendingRef.current[axis] !== null;
    setHead(prev => {
      if (!prev) return h;
      return {
        ...h,
        targetTilt: dirty('tilt') ? prev.targetTilt : h.targetTilt,
        targetSlide: dirty('slide') ? prev.targetSlide : h.targetSlide,
      };
    });
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const id = window.setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  const commit = useCallback(async (axis: Axis, value: number) => {
    draggingRef.current[axis] = false;
    const pending = pendingRef.current[axis];
    const unchanged = pending === null && polledRef.current[axis] === value;
    if (inFlightRef.current[axis] === value || pending === value || unchanged) return;
    inFlightRef.current[axis] = value;
    pendingRef.current[axis] = value;
    const patch: HydroShift2CurveHeadPatch = { [axis]: value };
    let res: unknown | null = null;
    try {
      res = await setHydroShift2CurveHead(patch);
    } finally {
      inFlightRef.current[axis] = null;
      putDoneRef.current = issuedRef.current;
      if (res === null && pendingRef.current[axis] === value) pendingRef.current[axis] = null;
    }
    await refresh();
  }, [refresh]);

  const recalibrate = useCallback(async () => {
    await recalibrateHydroShift2CurveHead();
    await refresh();
  }, [refresh]);

  if (!head || !head.connected) return null;

  const busy = head.calibrating;
  const status: SettingState | undefined = head.calibrating
    ? { label: t('devices.lianliCurve.statusCalibrating'), tone: 'warn' }
    : head.moving
      ? { label: t('devices.lianliCurve.statusMoving'), tone: 'accent' }
      : undefined;

  const axisSlider = (
    axis: Axis,
    label: string,
    ariaLabel: string,
    value: number,
    min: number,
    max: number,
    format: (v: number) => string,
  ) => (
    <SettingSlider
      editable
      trackFill
      label={label}
      description={axis === 'tilt' ? undefined : t('devices.lianliCurve.heightHint')}
      value={value}
      min={min}
      max={max}
      step={1}
      formatValue={format}
      ariaLabel={ariaLabel}
      disabled={busy}
      onChange={(v: number, done?: boolean) => {
        draggingRef.current[axis] = true;
        setHead(prev => (prev
          ? { ...prev, [axis === 'tilt' ? 'targetTilt' : 'targetSlide']: v }
          : prev));
        if (done) void commit(axis, v);
      }}
      onCommit={(v: number) => { void commit(axis, v); }}
    />
  );

  return (
    <SettingsSection title={t('devices.lianliCurve.headSection')}>
      {axisSlider(
        'tilt',
        t('devices.lianliCurve.tilt'),
        t('devices.lianliCurve.tiltAria'),
        head.targetTilt,
        0,
        head.tiltMax,
        v => localizeNumbers(`${v}°`, numberFormat),
      )}
      {axisSlider(
        'slide',
        t('devices.lianliCurve.height'),
        t('devices.lianliCurve.heightAria'),
        head.targetSlide,
        head.slideMin,
        head.slideMax,
        v => localizeNumbers(v > 0 ? `+${v}` : String(v), numberFormat),
      )}
      <SettingRow
        label={t('devices.lianliCurve.recalibrate')}
        description={t('devices.lianliCurve.recalibrateHint')}
        state={status}
      >
        <Button size="sm" tone="neutral" disabled={busy} onClick={() => { void recalibrate(); }}>
          {t('devices.lianliCurve.recalibrate')}
        </Button>
      </SettingRow>
    </SettingsSection>
  );
}

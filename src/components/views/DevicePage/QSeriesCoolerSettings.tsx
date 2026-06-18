import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { CurveGraph } from '../../../panel/widgets/cooling/page/CurveEditor';
import type { CurvePoint } from '../../../api/cooling';
import {
  getQSeriesState, setQSeriesTurbo,
  getQSeriesFirmwareCurve, setQSeriesFirmwareCurve,
  type QSeriesCoolerState, type QSeriesFirmwareCurve, type QSeriesCurvePoint,
} from '../../../api/qseries';
import { useTranslation } from '../../../lib/i18n';
import styles from './QSeriesCoolerSettings.module.scss';

/**
 * Q-series (Q60 / Q80) cooler firmware options, rendered inside the Q60 device
 * page's settings tab. Pump control MODE (BIOS / FW Control / curves) lives in
 * the cooling menu's fan card, not here. This single "Cooler firmware" section
 * carries turbo plus the two onboard temperature curves (pump + fan) the cooler
 * drives from when a device is in FW Control. The curves reuse the cooling
 * page's CurveGraph in editable mode. State from <c>GET /devices/qseries</c>,
 * the curve from <c>GET /devices/qseries/firmware-curve</c>.
 */
const toCurve = (pts: QSeriesCurvePoint[]): CurvePoint[] =>
  pts.map(p => ({ temp: p.tempC, speed: p.dutyPercent }));
const toApi = (pts: CurvePoint[]): QSeriesCurvePoint[] =>
  pts.map(p => ({ tempC: Math.round(p.temp), dutyPercent: Math.round(p.speed) }));

// Duty ceilings the firmware enforces when turbo is off (see devices.q60.turboHelp).
// Drawn as a dashed limit line on the curves; turbo on removes the cap (no line).
const PUMP_TURBO_OFF_LIMIT = 70;
const FAN_TURBO_OFF_LIMIT = 65;

// HYTE factory-default firmware curves (coolant temp -> duty %). The firmware has
// no reset command, so Reset writes these known-good defaults back to the device.
const DEFAULT_PUMP: CurvePoint[] = [
  { temp: 34, speed: 32 }, { temp: 38, speed: 37 }, { temp: 43, speed: 45 },
  { temp: 47, speed: 56 }, { temp: 50, speed: 91 },
];
const DEFAULT_FAN: CurvePoint[] = [
  { temp: 43, speed: 29 }, { temp: 48, speed: 39 }, { temp: 51, speed: 50 },
  { temp: 54, speed: 59 }, { temp: 56, speed: 91 },
];

export function QSeriesCoolerSettings() {
  const { t } = useTranslation();
  const [state, setState] = useState<QSeriesCoolerState | null>(null);
  const aliveRef = useRef(true);

  // Firmware curve: device meta + the two editable point sets.
  const [curve, setCurve] = useState<QSeriesFirmwareCurve | null>(null);
  const [pumpPts, setPumpPts] = useState<CurvePoint[]>([]);
  const [fanPts, setFanPts] = useState<CurvePoint[]>([]);
  const [curveDirty, setCurveDirty] = useState(false);
  const [curveSaving, setCurveSaving] = useState(false);

  const refresh = useCallback(async () => {
    const s = await getQSeriesState().catch(() => null);
    if (aliveRef.current && s) setState(s);
  }, []);

  const refreshCurve = useCallback(async () => {
    const c = await getQSeriesFirmwareCurve().catch(() => null);
    if (!aliveRef.current || !c) return;
    setCurve(c);
    if (c.supported) {
      setPumpPts(toCurve(c.pump));
      setFanPts(toCurve(c.fan));
      setCurveDirty(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    void refreshCurve();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, refreshCurve]);

  const commitTurbo = useCallback(async (on: boolean) => {
    setState(prev => (prev ? { ...prev, turboOn: on } : prev));
    await setQSeriesTurbo(on).catch(() => {});
  }, []);

  const writeCurve = useCallback(async (pump: CurvePoint[], fan: CurvePoint[]) => {
    setCurveSaving(true);
    try {
      await setQSeriesFirmwareCurve(toApi(pump), toApi(fan));
      if (aliveRef.current) setCurveDirty(false);
      await refreshCurve();
    } finally {
      if (aliveRef.current) setCurveSaving(false);
    }
  }, [refreshCurve]);

  const resetCurve = useCallback(() => {
    setPumpPts(DEFAULT_PUMP);
    setFanPts(DEFAULT_FAN);
    void writeCurve(DEFAULT_PUMP, DEFAULT_FAN);
  }, [writeCurve]);

  if (!state?.connected) {
    return (
      <SettingsSection title={t('devices.q60.firmwareSection')} boxClassName={styles.sectionBox}>
        <div className={styles.note}>{t('devices.q60.notConnected')}</div>
      </SettingsSection>
    );
  }

  const tempMin = curve?.tempMin ?? 0;
  const tempMax = curve?.tempMax ?? 75;

  return (
    <SettingsSection title={t('devices.q60.firmwareSection')} boxClassName={styles.sectionBox}>
      <SettingToggle
        label={t('devices.q60.turbo')}
        description={t('devices.q60.turboHelp')}
        checked={state.turboOn}
        onChange={on => void commitTurbo(on)}
      />

      {curve && !curve.supported ? (
        <div className={styles.note}>{t('devices.q60.curveUnsupported')}</div>
      ) : (
        <>
          <div className={styles.curveBlock}>
            <span className={styles.curveTitle}>{t('devices.q60.pumpCurve')}</span>
            <CurveGraph
              points={pumpPts}
              tempMin={tempMin}
              tempMax={tempMax}
              editable
              limitPercent={state.turboOn ? undefined : PUMP_TURBO_OFF_LIMIT}
              onChange={pts => { setPumpPts(pts); setCurveDirty(true); }}
            />
          </div>
          <div className={styles.curveBlock}>
            <span className={styles.curveTitle}>{t('devices.q60.fanCurve')}</span>
            <CurveGraph
              points={fanPts}
              tempMin={tempMin}
              tempMax={tempMax}
              editable
              limitPercent={state.turboOn ? undefined : FAN_TURBO_OFF_LIMIT}
              onChange={pts => { setFanPts(pts); setCurveDirty(true); }}
            />
          </div>
          <span className={styles.helpText}>{t('devices.q60.curveHint')}</span>
          <div className={styles.saveRow}>
            <Button type="button" size="sm" tone="neutral" icon={<RotateCcw size={12} aria-hidden />}
              onClick={resetCurve} disabled={curveSaving}>
              {t('cooling.curves.resetBtn')}
            </Button>
            <Button type="button" size="sm" tone="accent"
              onClick={() => void writeCurve(pumpPts, fanPts)} disabled={!curveDirty || curveSaving}>
              {curveSaving ? t('devices.saving') : t('devices.q60.saveCurve')}
            </Button>
          </div>
        </>
      )}
    </SettingsSection>
  );
}

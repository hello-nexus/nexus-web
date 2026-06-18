import { useCallback, useEffect, useRef, useState } from 'react';
import { Toggle } from '../../common/Toggle/Toggle';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
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

export function QSeriesCoolerSettings() {
  const { t } = useTranslation();
  const [state, setState] = useState<QSeriesCoolerState | null>(null);
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    try { await setQSeriesTurbo(on); }
    finally { if (aliveRef.current) setSaving(false); }
  }, []);

  const saveCurve = useCallback(async () => {
    setCurveSaving(true);
    try {
      await setQSeriesFirmwareCurve(toApi(pumpPts), toApi(fanPts));
      if (aliveRef.current) setCurveDirty(false);
      await refreshCurve();
    } finally {
      if (aliveRef.current) setCurveSaving(false);
    }
  }, [pumpPts, fanPts, refreshCurve]);

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
      <div className={styles.row}>
        <span className={styles.rowLabel}>{t('devices.q60.turbo')}</span>
        <Toggle checked={state.turboOn} onChange={on => void commitTurbo(on)} ariaLabel={t('devices.q60.turbo')} />
        {saving && <span className={styles.savingBadge}>{t('devices.saving')}</span>}
      </div>
      <div className={styles.helpText}>{t('devices.q60.turboHelp')}</div>

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
          <div className={styles.saveRow}>
            <span className={styles.helpText}>{t('devices.q60.curveHint')}</span>
            <Button type="button" size="sm" tone="accent" onClick={() => void saveCurve()} disabled={!curveDirty || curveSaving}>
              {curveSaving ? t('devices.saving') : t('devices.q60.saveCurve')}
            </Button>
          </div>
        </>
      )}
    </SettingsSection>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Toggle } from '../../common/Toggle/Toggle';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { CurveGraphEditor, type CurveGraphPoint } from '../../common/CurveGraphEditor/CurveGraphEditor';
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
 * the cooling menu's fan card, not here. This surface carries the hub-wide
 * firmware options with no cooling-menu home: turbo, plus the two onboard
 * temperature curves (pump + fan) the cooler drives from when a device is in
 * FW Control. Reads live state from <c>GET /devices/qseries</c> and the curve
 * from <c>GET /devices/qseries/firmware-curve</c>.
 */
const toXY = (pts: QSeriesCurvePoint[]): CurveGraphPoint[] =>
  pts.map(p => ({ x: p.tempC, y: p.dutyPercent }));
const toApi = (pts: CurveGraphPoint[]): QSeriesCurvePoint[] =>
  pts.map(p => ({ tempC: Math.round(p.x), dutyPercent: Math.round(p.y) }));

export function QSeriesCoolerSettings() {
  const { t } = useTranslation();
  const [state, setState] = useState<QSeriesCoolerState | null>(null);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);

  // Firmware curve: device meta + the two editable point sets.
  const [curve, setCurve] = useState<QSeriesFirmwareCurve | null>(null);
  const [pumpPts, setPumpPts] = useState<CurveGraphPoint[]>([]);
  const [fanPts, setFanPts] = useState<CurveGraphPoint[]>([]);
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
      setPumpPts(toXY(c.pump));
      setFanPts(toXY(c.fan));
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
  const tempMax = curve?.tempMax ?? 50;

  return (
    <>
      <SettingsSection
        title={t('devices.q60.firmwareSection')}
        description={t('devices.q60.firmwareSectionDescription')}
        boxClassName={styles.sectionBox}
      >
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('devices.q60.turbo')}</span>
          <Toggle checked={state.turboOn} onChange={on => void commitTurbo(on)} ariaLabel={t('devices.q60.turbo')} />
          {saving && <span className={styles.savingBadge}>{t('devices.saving')}</span>}
        </div>
        <div className={styles.helpText}>{t('devices.q60.turboHelp')}</div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('devices.q60.pumpRpm')}</span>
          <span className={styles.rowValue}>{state.pumpRpm.toLocaleString()}</span>
        </div>
        {state.firmwareVersion && (
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('devices.q60.firmwareVersion')}</span>
            <span className={styles.rowValue}>{state.firmwareVersion}</span>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title={t('devices.q60.firmwareCurveSection')}
        description={t('devices.q60.firmwareCurveDescription')}
        boxClassName={styles.sectionBox}
      >
        {curve && !curve.supported ? (
          <div className={styles.note}>{t('devices.q60.curveUnsupported')}</div>
        ) : (
          <>
            <div className={styles.curveBlock}>
              <span className={styles.curveTitle}>{t('devices.q60.pumpCurve')}</span>
              <div className={styles.curveGraphBox}>
                <CurveGraphEditor
                  points={pumpPts}
                  xMin={tempMin} xMax={tempMax} yMin={0} yMax={100}
                  allowAddRemove={false}
                  ariaLabel={t('devices.q60.pumpCurve')}
                  onChange={pts => { setPumpPts(pts); setCurveDirty(true); }}
                />
              </div>
              <span className={styles.curveAxis}>{t('devices.q60.curveAxis', { min: tempMin, max: tempMax })}</span>
            </div>

            <div className={styles.curveBlock}>
              <span className={styles.curveTitle}>{t('devices.q60.fanCurve')}</span>
              <div className={styles.curveGraphBox}>
                <CurveGraphEditor
                  points={fanPts}
                  xMin={tempMin} xMax={tempMax} yMin={0} yMax={100}
                  allowAddRemove={false}
                  ariaLabel={t('devices.q60.fanCurve')}
                  onChange={pts => { setFanPts(pts); setCurveDirty(true); }}
                />
              </div>
              <span className={styles.curveAxis}>{t('devices.q60.curveAxis', { min: tempMin, max: tempMax })}</span>
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
    </>
  );
}

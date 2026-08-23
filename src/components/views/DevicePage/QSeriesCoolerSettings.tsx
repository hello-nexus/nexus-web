import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingSelect, SettingSlider, SettingToggle } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { CurveGraph } from '../../../panel/widgets/cooling/page/CurveEditor';
import type { CurvePoint } from '../../../api/cooling';
import {
  getQSeriesState, setQSeriesTurbo,
  getQSeriesFirmwareCurve, setQSeriesFirmwareCurve,
  getQSeriesFirmwareAnimation, setQSeriesFirmwareAnimation,
  qSeriesHexToRgb, qSeriesRgbToHex,
  QSERIES_FW_ANIMATION_COLOR, QSERIES_FW_ANIMATION_RAINBOW,
  QSERIES_FW_ANIMATION_BREATHE, QSERIES_FW_ANIMATION_RAINBOW_GRADIENT,
  type QSeriesCoolerState, type QSeriesFirmwareCurve, type QSeriesCurvePoint,
  type QSeriesFirmwareAnimation, type QSeriesFwAnimationKind,
} from '../../../api/qseries';
import { animationsEqual, curvesEqual } from './qseriesFirmwareLightingUtils';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
// Safe variant: the component tests render this bare, outside a ToastProvider.
import { useToastSafe } from '../../common/Toast/Toast';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './QSeriesCoolerSettings.module.scss';

/**
 * Q-series (Q60 / Q80) cooler firmware options on the Q60 device page's settings
 * tab, split into a Cooling firmware section (turbo + the onboard pump/fan
 * curves) and a Lighting firmware section (the animation the cooler drives
 * itself when Nexus is not driving its LEDs). Pump control MODE (BIOS / FW
 * Control / curves) lives in the cooling menu's fan card, not here.
 *
 * Everything here is draft-state - turbo included, because writing it persists
 * to the MCU immediately - and an explicit Save PUTs. The Q-series firmware has
 * a limited EEPROM write budget, so nothing writes on a drag or a toggle. The
 * firmware-animation read can fail transiently (a read racing an in-flight
 * EEPROM write); a null result MUST NOT be treated as the device disconnecting -
 * that gate is `state.connected` alone.
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
  const { numberFormat } = useUnitPrefs();
  const { push: pushToast } = useToastSafe();
  const [state, setState] = useState<QSeriesCoolerState | null>(null);
  const aliveRef = useRef(true);

  // Firmware curve: device meta + the two editable point sets (draft).
  const [curve, setCurve] = useState<QSeriesFirmwareCurve | null>(null);
  const [pumpPts, setPumpPts] = useState<CurvePoint[]>([]);
  const [fanPts, setFanPts] = useState<CurvePoint[]>([]);
  const [curveSaving, setCurveSaving] = useState(false);
  // Turbo persists to the MCU (FF CC 0A) the moment it is written, so it is held
  // as a draft and committed with the curves rather than on every toggle.
  const [turboDraft, setTurboDraft] = useState<boolean | null>(null);
  // Mirrors the device turbo value so the stable refresh callback can read it.
  const turboBaselineRef = useRef<boolean | null>(null);

  // Firmware animation: `animation` is the local draft; `animationBaseline`
  // is the last-known device value, used to compute dirty/reset state.
  const [animation, setAnimation] = useState<QSeriesFirmwareAnimation | null>(null);
  const [animationBaseline, setAnimationBaseline] = useState<QSeriesFirmwareAnimation | null>(null);
  // Mirrors animationBaseline so the stable refreshAnimation callback can read it.
  const animationBaselineRef = useRef<QSeriesFirmwareAnimation | null>(null);
  const [animationSaving, setAnimationSaving] = useState(false);

  // Keeps an unsaved turbo edit (draft differing from the baseline the user
  // edited against) while still following the device when the draft is clean, so
  // a change made elsewhere - the hardware reset, another dashboard - lands here
  // instead of leaving a stale draft armed to write itself back.
  const refresh = useCallback(async () => {
    const s = await getQSeriesState().catch(() => null);
    if (!aliveRef.current || !s) return;
    const prevBaseline = turboBaselineRef.current;
    turboBaselineRef.current = s.turboOn;
    setState(s);
    setTurboDraft(prev =>
      prev !== null && prevBaseline !== null && prev !== prevBaseline ? prev : s.turboOn);
  }, []);

  const refreshCurve = useCallback(async () => {
    const c = await getQSeriesFirmwareCurve().catch(() => null);
    if (!aliveRef.current || !c) return;
    setCurve(c);
    if (c.supported) {
      setPumpPts(toCurve(c.pump));
      setFanPts(toCurve(c.fan));
    }
  }, []);

  // keepDirtyDraft preserves unsaved edits (draft differing from the baseline the
  // user edited against); the baseline still advances to the fresh device value.
  const refreshAnimation = useCallback(async (opts?: { keepDirtyDraft?: boolean }) => {
    const a = await getQSeriesFirmwareAnimation().catch(() => null);
    if (!aliveRef.current || !a) return;
    const prevBaseline = animationBaselineRef.current;
    animationBaselineRef.current = a;
    setAnimationBaseline(a);
    if (opts?.keepDirtyDraft) {
      setAnimation(prev =>
        prev !== null && prevBaseline !== null && !animationsEqual(prev, prevBaseline) ? prev : a);
    } else {
      setAnimation(a);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    void refreshCurve();
    void refreshAnimation();
    const onFocus = () => {
      void refresh();
      void refreshCurve();
      void refreshAnimation({ keepDirtyDraft: true });
    };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, refreshCurve, refreshAnimation]);

  const writeCooling = useCallback(async (
    pump: CurvePoint[], fan: CurvePoint[], turbo: boolean | null, writeCurve: boolean,
  ) => {
    setCurveSaving(true);
    try {
      // Turbo first: it caps the duties the firmware accepts, so the curve must
      // be written against the mode being saved. A failed turbo write therefore
      // aborts the curve too - writing it against the old mode would have the
      // firmware clamp the duties and the refetch would adopt the clamped values.
      if (turbo !== null) {
        const turboOk = await setQSeriesTurbo(turbo);
        if (!turboOk) {
          pushToast({ title: t('devices.q60.saveCoolingError') });
          return;
        }
        setState(prev => (prev ? { ...prev, turboOn: turbo } : prev));
        turboBaselineRef.current = turbo;
      }
      // Only when the curve is both supported and actually edited: an unloaded
      // curve would otherwise PUT empty point arrays, which the service rejects.
      if (writeCurve && !await setQSeriesFirmwareCurve(toApi(pump), toApi(fan))) {
        pushToast({ title: t('devices.q60.saveCoolingError') });
      }
      await refreshCurve();
    } finally {
      if (aliveRef.current) setCurveSaving(false);
    }
  }, [refreshCurve, pushToast, t]);

  const writeAnimation = useCallback(async (next: QSeriesFirmwareAnimation) => {
    setAnimationSaving(true);
    try {
      // The service verifies the write against a device readback and fails the
      // request when the cooler did not take it. Discarding that turned a failed
      // save into a silent revert to the old value (NEX-62).
      const ok = await setQSeriesFirmwareAnimation(next);
      if (!ok) pushToast({ title: t('devices.q60.saveAnimationError') });
      // Keep the draft on failure: the user has to retry it, and adopting the
      // device value here would silently discard the edit being reported failed.
      await refreshAnimation({ keepDirtyDraft: !ok });
    } finally {
      if (aliveRef.current) setAnimationSaving(false);
    }
  }, [refreshAnimation, pushToast, t]);

  if (!state?.connected) {
    return (
      <SettingsSection title={t('devices.q60.coolingFirmwareSection')} boxClassName={styles.sectionBox}>
        <div className={styles.note} data-settings-aside="true">{t('devices.q60.notConnected')}</div>
      </SettingsSection>
    );
  }

  const tempMin = curve?.tempMin ?? 0;
  const tempMax = curve?.tempMax ?? 75;
  const curveSupported = curve?.supported ?? false;
  const curveDirty = curveSupported
    ? !curvesEqual(pumpPts, toCurve(curve!.pump)) || !curvesEqual(fanPts, toCurve(curve!.fan))
    : false;
  const turboOn = turboDraft ?? state.turboOn;
  const turboDirty = turboDraft !== null && turboDraft !== state.turboOn;
  const coolingDirty = curveDirty || turboDirty;

  const animationLoaded = animation !== null;
  const animKind = animation?.animation ?? QSERIES_FW_ANIMATION_COLOR;
  const showColorPicker = animKind === QSERIES_FW_ANIMATION_COLOR;
  const hex = animation ? qSeriesRgbToHex(animation.r, animation.g, animation.b) : '#ffffff';
  const animationDirty = animationLoaded && !animationsEqual(animation, animationBaseline);

  return (
    <>
    <SettingsSection title={t('devices.q60.coolingFirmwareSection')} boxClassName={styles.sectionBox}>
      <SettingToggle
        label={t('devices.q60.turbo')}
        description={t('devices.q60.turboHelp')}
        checked={turboOn}
        onChange={on => setTurboDraft(on)}
      />

      {curve && !curve.supported ? (
        <div className={styles.note} data-settings-aside="true">{t('devices.q60.curveUnsupported')}</div>
      ) : (
        <>
          <div className={styles.curveBlock} data-settings-aside="true">
            <span className={styles.blockTitle}>{t('devices.q60.pumpCurve')}</span>
            <CurveGraph
              points={pumpPts}
              tempMin={tempMin}
              tempMax={tempMax}
              editable
              limitPercent={turboOn ? undefined : PUMP_TURBO_OFF_LIMIT}
              onChange={pts => setPumpPts(pts)}
            />
          </div>
          <div className={styles.curveBlock} data-settings-aside="true">
            <span className={styles.blockTitle}>{t('devices.q60.fanCurve')}</span>
            <CurveGraph
              points={fanPts}
              tempMin={tempMin}
              tempMax={tempMax}
              editable
              limitPercent={turboOn ? undefined : FAN_TURBO_OFF_LIMIT}
              onChange={pts => setFanPts(pts)}
            />
          </div>
          <span className={styles.helpText} data-settings-aside="true">{t('devices.q60.curveHint')}</span>
        </>
      )}

      <div className={styles.saveRow} data-settings-aside="true">
        <Button type="button" size="sm" tone="accent"
          onClick={() => void writeCooling(pumpPts, fanPts, turboDirty ? turboOn : null, curveDirty)}
          disabled={!coolingDirty || curveSaving}>
          {curveSaving ? t('devices.saving') : t('devices.q60.saveCooling')}
        </Button>
      </div>

    </SettingsSection>

    <SettingsSection title={t('devices.q60.lightingFirmwareSection')} boxClassName={styles.sectionBox}>
      {/* The cooler only drives these LEDs itself when Nexus is not driving them,
          so say when that is rather than leave the setting looking inert. */}
      <div className={styles.note} data-settings-aside="true">{t('devices.q60.lightingFirmwareHelp')}</div>

      {!state.fwAnimationSupported ? (
        <div className={styles.note} data-settings-aside="true">{t('devices.q60.fwAnimationUnsupported')}</div>
      ) : (
        <>
          {state.fwAnimationBrightnessSupported ? (
            <SettingSlider
              label={t('devices.y70.brightness')}
              value={animation?.brightness ?? 100}
              min={0}
              max={100}
              step={1}
              editable
              trackFill
              formatValue={v => localizeNumbers(`${Math.round(v)}%`, numberFormat)}
              disabled={!animationLoaded}
              onChange={(v: number) => {
                if (!animation) return;
                setAnimation({ ...animation, brightness: Math.round(v) });
              }}
            />
          ) : (
            <div className={styles.note} data-settings-aside="true">{t('devices.q60.fwAnimationBrightnessUnsupported')}</div>
          )}
          <SettingSelect
            label={t('devices.fwAnimation.effect')}
            value={String(animKind)}
            onChange={v => {
              if (!animation) return;
              setAnimation({ ...animation, animation: Number(v) as QSeriesFwAnimationKind });
            }}
            options={[
              { value: String(QSERIES_FW_ANIMATION_COLOR), label: t('devices.fwAnimation.solidColor') },
              { value: String(QSERIES_FW_ANIMATION_RAINBOW), label: t('devices.fwAnimation.rainbowCycle') },
              { value: String(QSERIES_FW_ANIMATION_BREATHE), label: t('devices.fwAnimation.breathing') },
              { value: String(QSERIES_FW_ANIMATION_RAINBOW_GRADIENT), label: t('devices.fwAnimation.rainbowGradient') },
            ]}
            disabled={!animationLoaded}
          />
          {showColorPicker && animationLoaded && (
            <div className={styles.colorBlock} data-settings-aside="true">
              <HsvPicker
                value={hex}
                onPreview={(next: string) => {
                  if (!animation) return;
                  const { r, g, b } = qSeriesHexToRgb(next);
                  setAnimation({ ...animation, r, g, b });
                }}
                onCommit={(next: string) => {
                  if (!animation) return;
                  const { r, g, b } = qSeriesHexToRgb(next);
                  setAnimation({ ...animation, r, g, b });
                }}
              />
            </div>
          )}
          <div className={styles.saveRow} data-settings-aside="true">
            <Button type="button" size="sm" tone="accent"
              onClick={() => { if (animation) void writeAnimation(animation); }}
              disabled={!animationDirty || animationSaving}>
              {animationSaving ? t('devices.saving') : t('devices.q60.saveLighting')}
            </Button>
          </div>
        </>
      )}

    </SettingsSection>
    </>
  );
}

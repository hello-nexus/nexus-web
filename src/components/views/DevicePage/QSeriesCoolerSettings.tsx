import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
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
import {
  QSERIES_DEFAULT_ANIMATION,
  animationsEqual, curvesEqual, isAtFactoryDefaults, planResetWrites,
} from './qseriesFirmwareLightingUtils';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import styles from './QSeriesCoolerSettings.module.scss';

/**
 * Q-series (Q60 / Q80) cooler firmware options, rendered inside the Q60 device
 * page's settings tab. Pump control MODE (BIOS / FW Control / curves) lives in
 * the cooling menu's fan card, not here. This single "Cooler firmware" section
 * carries turbo, the two onboard temperature curves (pump + fan), and the
 * firmware-mode LED animation the cooler drives from when Nexus isn't
 * streaming lighting frames. State from <c>GET /devices/qseries</c>, the curve
 * from <c>GET /devices/qseries/firmware-curve</c>, the animation from
 * <c>GET /devices/qseries/firmware-animation</c>.
 *
 * Curves and the animation are draft-state: onChange only mutates local
 * state, an explicit Save PUTs. The Q-series firmware has a limited EEPROM
 * write budget, so nothing here writes on every drag/keystroke. The
 * firmware-animation read in particular can fail transiently (a read racing
 * an in-flight EEPROM write); a null result MUST NOT be treated as the
 * device disconnecting - that gate is `state.connected` alone.
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
  const { numberFormat } = useUnitPrefs();
  const [state, setState] = useState<QSeriesCoolerState | null>(null);
  const aliveRef = useRef(true);

  // Firmware curve: device meta + the two editable point sets (draft).
  const [curve, setCurve] = useState<QSeriesFirmwareCurve | null>(null);
  const [pumpPts, setPumpPts] = useState<CurvePoint[]>([]);
  const [fanPts, setFanPts] = useState<CurvePoint[]>([]);
  const [curveSaving, setCurveSaving] = useState(false);

  // Firmware animation: `animation` is the local draft; `animationBaseline`
  // is the last-known device value, used to compute dirty/reset state.
  const [animation, setAnimation] = useState<QSeriesFirmwareAnimation | null>(null);
  const [animationBaseline, setAnimationBaseline] = useState<QSeriesFirmwareAnimation | null>(null);
  // Mirrors animationBaseline so the stable refreshAnimation callback can read it.
  const animationBaselineRef = useRef<QSeriesFirmwareAnimation | null>(null);
  const [animationSaving, setAnimationSaving] = useState(false);

  const [resetting, setResetting] = useState(false);

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
    const onFocus = () => { void refresh(); void refreshAnimation({ keepDirtyDraft: true }); };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh, refreshCurve, refreshAnimation]);

  const commitTurbo = useCallback(async (on: boolean) => {
    setState(prev => (prev ? { ...prev, turboOn: on } : prev));
    await setQSeriesTurbo(on).catch(() => {});
  }, []);

  const writeCurve = useCallback(async (pump: CurvePoint[], fan: CurvePoint[]) => {
    setCurveSaving(true);
    try {
      await setQSeriesFirmwareCurve(toApi(pump), toApi(fan));
      await refreshCurve();
    } finally {
      if (aliveRef.current) setCurveSaving(false);
    }
  }, [refreshCurve]);

  const writeAnimation = useCallback(async (next: QSeriesFirmwareAnimation) => {
    setAnimationSaving(true);
    try {
      await setQSeriesFirmwareAnimation(next);
      await refreshAnimation();
    } finally {
      if (aliveRef.current) setAnimationSaving(false);
    }
  }, [refreshAnimation]);

  const performReset = useCallback(async () => {
    if (!state) return;
    setResetting(true);
    try {
      const plan = planResetWrites({
        deviceTurboOn: state.turboOn,
        curveSupported: curve?.supported ?? false,
        devicePump: curve ? toCurve(curve.pump) : [],
        deviceFan: curve ? toCurve(curve.fan) : [],
        defaultPump: DEFAULT_PUMP,
        defaultFan: DEFAULT_FAN,
        animationSupported: state.fwAnimationSupported,
        deviceAnimation: animationBaseline,
      });

      setState(prev => (prev ? { ...prev, turboOn: false } : prev));
      if (curve?.supported) { setPumpPts(DEFAULT_PUMP); setFanPts(DEFAULT_FAN); }
      // Draft follows the reset only when the device state is known; with a null
      // baseline the write was skipped, and a defaults draft would arm a blind save.
      if (state.fwAnimationSupported && animationBaseline !== null) setAnimation(QSERIES_DEFAULT_ANIMATION);

      const writes: Promise<unknown>[] = [];
      if (plan.writeTurboOff) writes.push(setQSeriesTurbo(false));
      if (plan.writeCurve) writes.push(setQSeriesFirmwareCurve(toApi(DEFAULT_PUMP), toApi(DEFAULT_FAN)));
      if (plan.writeAnimation) writes.push(setQSeriesFirmwareAnimation(QSERIES_DEFAULT_ANIMATION));
      await Promise.all(writes);

      await Promise.all([refreshCurve(), refreshAnimation()]);
    } finally {
      if (aliveRef.current) setResetting(false);
    }
  }, [state, curve, animationBaseline, refreshCurve, refreshAnimation]);

  if (!state?.connected) {
    return (
      <SettingsSection title={t('devices.q60.firmwareSection')} boxClassName={styles.sectionBox}>
        <div className={styles.note} data-settings-aside="true">{t('devices.q60.notConnected')}</div>
      </SettingsSection>
    );
  }

  const tempMin = curve?.tempMin ?? 0;
  const tempMax = curve?.tempMax ?? 75;
  const curveDirty = curve?.supported
    ? !curvesEqual(pumpPts, toCurve(curve.pump)) || !curvesEqual(fanPts, toCurve(curve.fan))
    : false;

  const animationLoaded = animation !== null;
  const animKind = animation?.animation ?? QSERIES_FW_ANIMATION_COLOR;
  const showColorPicker = animKind === QSERIES_FW_ANIMATION_COLOR;
  const hex = animation ? qSeriesRgbToHex(animation.r, animation.g, animation.b) : '#ffffff';
  const animationDirty = animationLoaded && !animationsEqual(animation, animationBaseline);

  const resetDisabled = isAtFactoryDefaults({
    turboOn: state.turboOn,
    curveSupported: curve?.supported ?? false,
    draftPump: pumpPts,
    draftFan: fanPts,
    devicePump: curve ? toCurve(curve.pump) : [],
    deviceFan: curve ? toCurve(curve.fan) : [],
    defaultPump: DEFAULT_PUMP,
    defaultFan: DEFAULT_FAN,
    animationSupported: state.fwAnimationSupported,
    draftAnimation: animation,
    deviceAnimation: animationBaseline,
  });

  return (
    <SettingsSection title={t('devices.q60.firmwareSection')} boxClassName={styles.sectionBox}>
      <SettingToggle
        label={t('devices.q60.turbo')}
        description={t('devices.q60.turboHelp')}
        checked={state.turboOn}
        onChange={on => void commitTurbo(on)}
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
              limitPercent={state.turboOn ? undefined : PUMP_TURBO_OFF_LIMIT}
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
              limitPercent={state.turboOn ? undefined : FAN_TURBO_OFF_LIMIT}
              onChange={pts => setFanPts(pts)}
            />
          </div>
          <span className={styles.helpText} data-settings-aside="true">{t('devices.q60.curveHint')}</span>
          <div className={styles.saveRow} data-settings-aside="true">
            <Button type="button" size="sm" tone="accent"
              onClick={() => void writeCurve(pumpPts, fanPts)} disabled={!curveDirty || curveSaving}>
              {curveSaving ? t('devices.saving') : t('devices.q60.saveCurve')}
            </Button>
          </div>
        </>
      )}

      {!state.fwAnimationSupported ? (
        <div className={styles.note} data-settings-aside="true">{t('devices.q60.fwAnimationUnsupported')}</div>
      ) : (
        <>
          <span className={styles.blockTitle} data-settings-aside="true">{t('devices.q60.ledAnimationSection')}</span>
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
          <div className={styles.saveRow} data-settings-aside="true">
            <Button type="button" size="sm" tone="accent"
              onClick={() => { if (animation) void writeAnimation(animation); }}
              disabled={!animationDirty || animationSaving}>
              {animationSaving ? t('devices.saving') : t('devices.q60.saveAnimation')}
            </Button>
          </div>
        </>
      )}

      <div className={styles.saveRow} data-settings-aside="true">
        <Button type="button" size="sm" tone="neutral" icon={<RotateCcw size={12} aria-hidden />}
          onClick={() => void performReset()} disabled={resetDisabled || resetting}>
          {t('cooling.curves.resetBtn')}
        </Button>
      </div>
    </SettingsSection>
  );
}

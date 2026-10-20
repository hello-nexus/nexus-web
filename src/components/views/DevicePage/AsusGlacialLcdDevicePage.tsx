import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingRow, SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Slider } from '../../common/Slider/Slider';
import { useToast } from '../../common/Toast/Toast';
import { SensorPicker, useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import {
  getGlacialState,
  setGlacialSettings,
  type GlacialMode,
  type GlacialSettingsPatch,
  type GlacialSlotState,
  type GlacialState,
} from '../../../api/asus-glacial-lcd';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { useReportDeviceWaiting } from './deviceDetecting';
import styles from './LianLiDevicePage.module.scss';

const POLL_MS = 3000;
const MODES: readonly GlacialMode[] = ['monitor', 'animated', 'static'];
const MODE_KEYS: Record<GlacialMode, string> = {
  monitor: 'devices.asus-glacial-lcd.modeMonitor',
  animated: 'devices.asus-glacial-lcd.modeAnimation',
  static: 'devices.asus-glacial-lcd.modePicture',
};
const SLOT_COUNTS = [1, 2, 3] as const;
const SENSOR_CATEGORIES = ['cpu', 'gpu', 'motherboard'] as const;
// The display shows only these two units.
const SENSOR_TYPES = ['Temperature', 'Voltage'] as const;
// The service starts this animation when the display is turned on before any mode was chosen.
const FIRST_RUN_ANIMATION = 1;
const DEFAULT_CATEGORY = SENSOR_CATEGORIES[0];

export function AsusGlacialLcdDevicePage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const { numberFormat } = useUnitPrefs();
  const lookup = useSensorLookup();
  const [state, setState] = useState<GlacialState | null>(null);
  useReportDeviceWaiting(state === null || !state.isConnected);
  const aliveRef = useRef(true);
  // Writes in flight: a poll landing meanwhile would snap a control back.
  const busyRef = useRef(0);

  const refresh = useCallback(async () => {
    if (busyRef.current > 0) return;
    const next = await getGlacialState();
    if (!aliveRef.current || next === null || busyRef.current > 0) return;
    setState(next);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const commit = useCallback(async (patch: GlacialSettingsPatch) => {
    busyRef.current += 1;
    let ok = false;
    try {
      ok = await setGlacialSettings(patch);
    } catch {
      ok = false;
    } finally {
      busyRef.current -= 1;
    }
    if (!ok) push({ title: t('devices.asus-glacial-lcd.failedTitle'), body: t('devices.asus-glacial-lcd.failedBody') });
    const next = await getGlacialState();
    if (aliveRef.current && next !== null && busyRef.current === 0) setState(next);
  }, [push, t]);

  const edit = useCallback((local: Partial<GlacialState>, patch: GlacialSettingsPatch) => {
    setState(prev => prev && { ...prev, ...local });
    void commit(patch);
  }, [commit]);

  const ready = state !== null && state.isConnected;
  const chosen = state?.modeChosen === true;
  const mode = state?.mode ?? 'monitor';
  const assets = mode === 'static' ? state?.staticAssets ?? [] : state?.animatedAssets ?? [];
  const activeAsset = mode === 'static' ? state?.staticAsset : state?.animatedAsset;
  const assetKey = mode === 'static' ? 'devices.asus-glacial-lcd.pictureN' : 'devices.asus-glacial-lcd.animationN';

  const setSlot = (index: number, category: string, sensor: string) => {
    if (!state) return;
    const slots: GlacialSlotState[] = state.slots.map((s, i) => (i === index ? { ...s, category, sensor, label: '' } : s));
    edit({ slots }, { slots: slots.map(({ category: c, sensor: n, label }) => ({ category: c, sensor: n, label })) });
  };

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="ROG Crosshair X870E Glacial"
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection title={t('devices.asus-glacial-lcd.displaySection')} boxClassName={styles.sectionBox}>
          <SettingToggle
            label={t('devices.asus-glacial-lcd.displayOn')}
            checked={state?.displayOn ?? false}
            disabled={!ready}
            onChange={on => edit(
              on && !chosen ? { displayOn: on, mode: 'animated', animatedAsset: FIRST_RUN_ANIMATION, modeChosen: true } : { displayOn: on },
              { displayOn: on },
            )}
          />
          <SettingToggle
            label={t('devices.asus-glacial-lcd.stayOn')}
            description={t('devices.asus-glacial-lcd.stayOnHint')}
            checked={state?.stayOnWhileAsleep ?? false}
            disabled={!ready}
            onChange={on => edit({ stayOnWhileAsleep: on }, { stayOnWhileAsleep: on })}
          />
          <Slider
            // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
            orientation="stacked"
            editable
            trackFill
            label={t('devices.asus-glacial-lcd.brightness')}
            ariaLabel={t('devices.asus-glacial-lcd.brightnessAria')}
            value={state?.brightness ?? 0}
            min={0}
            max={100}
            step={1}
            formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
            disabled={!ready}
            onChange={v => setState(prev => prev && { ...prev, brightness: v })}
            onCommit={v => { void commit({ brightness: v }); }}
          />
        </SettingsSection>

        <SettingsSection title={t('devices.asus-glacial-lcd.contentSection')} boxClassName={styles.sectionBox}>
          <SettingRow label={t('devices.asus-glacial-lcd.mode')}>
            <ChipGroup
              ariaLabel={t('devices.asus-glacial-lcd.mode')}
              activeKey={chosen ? mode : ''}
              options={MODES.map(m => ({ key: m, label: t(MODE_KEYS[m]), disabled: !ready }))}
              onChange={key => edit({ mode: key as GlacialMode, modeChosen: true }, { mode: key as GlacialMode })}
            />
          </SettingRow>

          {chosen && mode !== 'monitor' && (
            <SettingSelect
              label={t(mode === 'static' ? 'devices.asus-glacial-lcd.picture' : 'devices.asus-glacial-lcd.animation')}
              value={String(activeAsset ?? '')}
              options={assets.map((id, i) => ({ value: String(id), label: t(assetKey, { n: i + 1 }) }))}
              disabled={!ready}
              onChange={v => {
                const id = Number(v);
                if (mode === 'static') edit({ staticAsset: id }, { staticAsset: id });
                else edit({ animatedAsset: id }, { animatedAsset: id });
              }}
            />
          )}

          {chosen && mode === 'monitor' && state && (
            <>
              <SettingRow label={t('devices.asus-glacial-lcd.widgetCount')}>
                <ChipGroup
                  ariaLabel={t('devices.asus-glacial-lcd.widgetCount')}
                  activeKey={String(state.slotCount)}
                  options={SLOT_COUNTS.map(n => ({ key: String(n), label: localizeNumbers(String(n), numberFormat), disabled: !ready }))}
                  onChange={key => edit({ slotCount: Number(key) }, { slotCount: Number(key) })}
                />
              </SettingRow>
              {state.slots.slice(0, state.slotCount).map((slot, i) => (
                <SettingRow key={i} label={t('devices.asus-glacial-lcd.widgetN', { n: i + 1 })}>
                  <SensorPicker
                    lookup={lookup}
                    category={(slot.sensor ? slot.category : slot.resolvedCategory) || DEFAULT_CATEGORY}
                    sensor={slot.sensor || slot.resolvedSensor}
                    categories={SENSOR_CATEGORIES}
                    sensorTypes={SENSOR_TYPES}
                    disabled={!ready}
                    onChange={sel => setSlot(i, sel.category, sel.sensor)}
                  />
                </SettingRow>
              ))}
            </>
          )}
        </SettingsSection>
      </div>
    </div>
  );
}

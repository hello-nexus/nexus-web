import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingRow, SettingSelect } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Slider } from '../../common/Slider/Slider';
import { useToast } from '../../common/Toast/Toast';
import {
  getRyujinDisplay,
  setRyujinDisplay,
  RYUJIN_MAX_BRIGHTNESS,
  RYUJIN_MIN_BRIGHTNESS,
  type RyujinDisplayPatch,
  type RyujinDisplayState,
  type RyujinRotation,
  type RyujinSensorCount,
} from '../../../api/asus-ryujin-extreme';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { useReportDeviceWaiting } from './deviceDetecting';
import styles from './LianLiDevicePage.module.scss';

const POLL_MS = 3000;
const STACKED = 'stacked' as const;
const ROTATIONS: readonly RyujinRotation[] = [0, 90];
const SENSOR_COUNTS: readonly RyujinSensorCount[] = [2, 3];
const SENSOR_LABEL_KEYS: Record<string, string> = {
  'cpu-temp': 'devices.asus-ryujin-extreme.sensor.cpuTemp',
  'gpu-temp': 'devices.asus-ryujin-extreme.sensor.gpuTemp',
  'liquid-temp': 'devices.asus-ryujin-extreme.sensor.liquidTemp',
  'pump-rpm': 'devices.asus-ryujin-extreme.sensor.pumpRpm',
  'fan-rpm': 'devices.asus-ryujin-extreme.sensor.fanRpm',
};

/** The ROG Ryujin III Extreme page: the display settings its screen stores. Pump and fans live on the Cooling page. */
export function AsusRyujinExtremeDevicePage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const { numberFormat } = useUnitPrefs();
  const [state, setState] = useState<RyujinDisplayState | null>(null);
  useReportDeviceWaiting(state === null || !state.isConnected);
  const aliveRef = useRef(true);
  // Writes in flight: a poll landing meanwhile would snap a control back.
  const busyRef = useRef(0);
  // A brightness drag in progress: a poll landing before its final write would snap the knob back.
  const draggingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current > 0 || draggingRef.current) return;
    const next = await getRyujinDisplay();
    if (!aliveRef.current || next === null || busyRef.current > 0 || draggingRef.current) return;
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

  const commit = useCallback(async (patch: RyujinDisplayPatch) => {
    busyRef.current += 1;
    draggingRef.current = false;
    let ok = false;
    try {
      ok = await setRyujinDisplay(patch);
    } catch {
      ok = false;
    } finally {
      busyRef.current -= 1;
    }
    if (!ok) push({ title: t('devices.asus-ryujin-extreme.failedTitle'), body: t('devices.asus-ryujin-extreme.failedBody') });
    const next = await getRyujinDisplay();
    if (aliveRef.current && next !== null && busyRef.current === 0) setState(next);
  }, [push, t]);

  const ready = state !== null && state.isConnected;
  const sensorCount = state?.sensorCount === 2 ? 2 : 3;
  const sensorOptions = (state?.availableSensors ?? [])
    .filter(id => id in SENSOR_LABEL_KEYS)
    .map(id => ({ value: id, label: t(SENSOR_LABEL_KEYS[id]) }));

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="ROG Ryujin III Extreme"
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection title={t('devices.asus-ryujin-extreme.displaySection')} boxClassName={styles.sectionBox}>
          <Slider
            editable
            trackFill
            orientation={STACKED}
            label={t('devices.asus-ryujin-extreme.brightness')}
            ariaLabel={t('devices.asus-ryujin-extreme.brightnessAria')}
            value={state?.brightness ?? RYUJIN_MIN_BRIGHTNESS}
            min={RYUJIN_MIN_BRIGHTNESS}
            max={RYUJIN_MAX_BRIGHTNESS}
            step={1}
            formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
            disabled={!ready}
            onChange={v => {
              draggingRef.current = true;
              setState(prev => prev && { ...prev, brightness: v });
            }}
            onCommit={v => { void commit({ brightness: v }); }}
          />
          <SettingRow label={t('devices.asus-ryujin-extreme.rotation')}>
            <ChipGroup
              ariaLabel={t('devices.asus-ryujin-extreme.rotation')}
              activeKey={String(state?.rotation ?? '')}
              options={ROTATIONS.map(r => ({
                key: String(r),
                label: t('devices.asus-ryujin-extreme.rotationDegrees', { n: localizeNumbers(String(r), numberFormat) }),
                disabled: !ready,
              }))}
              onChange={key => {
                const rotation = Number(key) as RyujinRotation;
                setState(prev => prev && { ...prev, rotation });
                void commit({ rotation });
              }}
            />
          </SettingRow>
          <SettingRow label={t('devices.asus-ryujin-extreme.readings')}>
            <ChipGroup
              ariaLabel={t('devices.asus-ryujin-extreme.readings')}
              activeKey={state ? String(sensorCount) : ''}
              options={SENSOR_COUNTS.map(n => ({
                key: String(n),
                label: localizeNumbers(String(n), numberFormat),
                disabled: !ready,
              }))}
              onChange={key => {
                const next = Number(key) as RyujinSensorCount;
                setState(prev => prev && { ...prev, sensorCount: next });
                void commit({ sensorCount: next });
              }}
            />
          </SettingRow>
          {Array.from({ length: sensorCount }, (_, i) => (
            <SettingSelect
              key={i}
              label={t('devices.asus-ryujin-extreme.reading', { n: localizeNumbers(String(i + 1), numberFormat) })}
              value={state?.slots[i] ?? ''}
              options={sensorOptions}
              disabled={!ready}
              onChange={id => {
                if (!state) return;
                const slots = state.slots.slice(0, 3);
                slots[i] = id;
                setState(prev => prev && { ...prev, slots });
                void commit({ slots });
              }}
            />
          ))}
        </SettingsSection>
      </div>
    </div>
  );
}

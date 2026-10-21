import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingRow, SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Slider } from '../../common/Slider/Slider';
import { useToast } from '../../common/Toast/Toast';
import { SensorPicker, useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import { DECK_MONITORING_CATEGORIES } from '../../../panel/widgets/deck/deckMonitoring';
import { sensorsForDevice } from '../../../panel/widgets/monitoring/sensorPicker';
import {
  getMystiqueState,
  setMystiqueSettings,
  type MystiqueMode,
  type MystiqueReadout,
  type MystiqueSettingsPatch,
  type MystiqueState,
} from '../../../api/deepcool-mystique';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { useReportDeviceWaiting } from './deviceDetecting';
import styles from './LianLiDevicePage.module.scss';

const POLL_MS = 3000;
const MODES: readonly MystiqueMode[] = ['monitor', 'media', 'recording'];
const MODE_KEYS: Record<MystiqueMode, string> = {
  monitor: 'devices.deepcool-mystique.modeMonitor',
  media: 'devices.deepcool-mystique.modeMedia',
  recording: 'devices.deepcool-mystique.modeRecording',
};
const READOUTS: readonly MystiqueReadout[] = ['temperature', 'frequency', 'time', 'pump', 'fan', 'fanPump'];
const READOUT_KEYS: Record<MystiqueReadout, string> = {
  temperature: 'devices.deepcool-mystique.readoutTemperature',
  frequency: 'devices.deepcool-mystique.readoutFrequency',
  time: 'devices.deepcool-mystique.readoutTime',
  pump: 'devices.deepcool-mystique.readoutPump',
  fan: 'devices.deepcool-mystique.readoutFan',
  fanPump: 'devices.deepcool-mystique.readoutFanPump',
};
type PickKey = 'cpuTemperature' | 'cpuFrequency' | 'cpuUsage' | 'ramUsage' | 'cpuFan' | 'pump';
// Each readout takes one sensor type, so a picker offers only the categories that list one.
// `fallback` is the category shown while an automatic readout resolves to nothing.
const PICKS: readonly { key: PickKey; type: string; label: string; fallback: string }[] = [
  { key: 'cpuTemperature', type: 'Temperature', label: 'devices.deepcool-mystique.cpuTemperature', fallback: 'cpu' },
  { key: 'cpuFrequency', type: 'Clock', label: 'devices.deepcool-mystique.cpuFrequency', fallback: 'cpu' },
  { key: 'cpuUsage', type: 'Load', label: 'devices.deepcool-mystique.cpuUsage', fallback: 'cpu' },
  { key: 'ramUsage', type: 'Load', label: 'devices.deepcool-mystique.ramUsage', fallback: 'memory' },
  { key: 'cpuFan', type: 'Fan', label: 'devices.deepcool-mystique.cpuFan', fallback: 'motherboard' },
  { key: 'pump', type: 'Fan', label: 'devices.deepcool-mystique.pump', fallback: 'motherboard' },
];

export function DeepCoolMystiqueDevicePage() {
  const { t } = useTranslation();
  const { push } = useToast();
  const { numberFormat } = useUnitPrefs();
  const lookup = useSensorLookup();
  const [state, setState] = useState<MystiqueState | null>(null);
  useReportDeviceWaiting(state === null || !state.isConnected);
  const aliveRef = useRef(true);
  // Writes in flight: a poll landing meanwhile would snap a control back.
  const busyRef = useRef(0);
  // Bumped when a write starts and when it settles; a read that began before either is stale.
  const writeGenRef = useRef(0);
  // A brightness drag is under way, so a poll must not move the thumb.
  const draggingRef = useRef(false);
  // The brightness the service last reported or accepted, so a commit that changes nothing sends nothing.
  const brightnessRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (busyRef.current > 0 || draggingRef.current) return;
    const gen = writeGenRef.current;
    const next = await getMystiqueState();
    if (!aliveRef.current || next === null || busyRef.current > 0 || draggingRef.current || gen !== writeGenRef.current) return;
    brightnessRef.current = next.brightness;
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

  const commit = useCallback(async (patch: MystiqueSettingsPatch) => {
    busyRef.current += 1;
    writeGenRef.current += 1;
    let ok = false;
    try {
      ok = await setMystiqueSettings(patch);
    } catch {
      ok = false;
    } finally {
      busyRef.current -= 1;
      writeGenRef.current += 1;
    }
    if (!ok) push({ title: t('devices.deepcool-mystique.failedTitle'), body: t('devices.deepcool-mystique.failedBody') });
    const gen = writeGenRef.current;
    const next = await getMystiqueState();
    if (aliveRef.current && next !== null && busyRef.current === 0 && !draggingRef.current && gen === writeGenRef.current) {
      brightnessRef.current = next.brightness;
      setState(next);
    }
  }, [push, t]);

  const edit = useCallback((local: Partial<MystiqueState>, patch: MystiqueSettingsPatch) => {
    setState(prev => prev && { ...prev, ...local });
    void commit(patch);
  }, [commit]);

  const ready = state !== null && state.isConnected;
  const chosen = state?.modeChosen === true;
  const mode = state?.mode ?? 'monitor';

  const categoriesByType = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const type of new Set(PICKS.map(p => p.type))) {
      out[type] = DECK_MONITORING_CATEGORIES.filter(c => sensorsForDevice(lookup.sensors, lookup.networkSensors, lookup.extras, c).some(o => o.type === type));
    }
    return out;
  }, [lookup.sensors, lookup.networkSensors, lookup.extras]);

  const picker = (key: PickKey, type: string, fallback: string) => {
    const slot = state?.[key];
    const onPick = (category: string, sensor: string) => {
      if (!state) return;
      edit({ [key]: { ...state[key], category, sensor } }, { [key]: { category, sensor } });
    };
    return (
      <SensorPicker
        lookup={lookup}
        category={(slot?.sensor ? slot.category : slot?.resolvedCategory) || fallback}
        sensor={slot?.sensor || slot?.resolvedSensor || ''}
        disabled={!ready}
        categories={categoriesByType[type]}
        sensorTypes={[type]}
        automatic={{ label: t('devices.deepcool-mystique.automatic'), active: !slot?.sensor, onSelect: () => onPick('', '') }}
        onChange={sel => onPick(sel.category, sel.sensor)}
      />
    );
  };

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="DeepCool Mystique"
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection title={t('devices.deepcool-mystique.displaySection')} boxClassName={styles.sectionBox}>
          <Slider
            editable
            trackFill
            // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
            orientation="stacked"
            label={t('devices.deepcool-mystique.brightness')}
            ariaLabel={t('devices.deepcool-mystique.brightnessAria')}
            value={state?.brightness ?? 0}
            min={0}
            max={100}
            step={1}
            formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
            disabled={!ready}
            onPointerDown={e => { if (e.button === 0) draggingRef.current = true; }}
            onPointerCancel={() => { draggingRef.current = false; }}
            onChange={v => setState(prev => prev && { ...prev, brightness: v })}
            onCommit={v => {
              draggingRef.current = false;
              if (v === brightnessRef.current) return;
              brightnessRef.current = v;
              setState(prev => prev && { ...prev, deviceChosen: true });
              void commit({ brightness: v });
            }}
          />
          <SettingToggle
            label={t('devices.deepcool-mystique.gyroscope')}
            description={t('devices.deepcool-mystique.gyroscopeHint')}
            checked={state?.gyroscope ?? false}
            disabled={!ready}
            onChange={on => edit({ gyroscope: on, deviceChosen: true }, { gyroscope: on })}
          />
          <SettingToggle
            label={t('devices.deepcool-mystique.rgbSync')}
            description={t('devices.deepcool-mystique.rgbSyncHint')}
            checked={state?.rgbSync ?? false}
            disabled={!ready}
            onChange={on => edit({ rgbSync: on, deviceChosen: true }, { rgbSync: on })}
          />
          <SettingRow
            label={t('devices.deepcool-mystique.sentTogether')}
            description={t(state?.deviceChosen ? 'devices.deepcool-mystique.deviceSetHint' : 'devices.deepcool-mystique.deviceUnsetHint')}
          />
        </SettingsSection>

        <SettingsSection title={t('devices.deepcool-mystique.contentSection')} boxClassName={styles.sectionBox}>
          <SettingRow label={t('devices.deepcool-mystique.mode')}>
            <ChipGroup
              ariaLabel={t('devices.deepcool-mystique.mode')}
              activeKey={chosen ? mode : ''}
              options={MODES.map(m => ({ key: m, label: t(MODE_KEYS[m]), disabled: !ready }))}
              onChange={key => edit({ mode: key as MystiqueMode, modeChosen: true }, { mode: key as MystiqueMode })}
            />
          </SettingRow>

          {chosen && mode === 'media' && (
            <SettingRow label={t('devices.deepcool-mystique.modeMedia')} description={t('devices.deepcool-mystique.mediaHint')} />
          )}

          {chosen && mode === 'monitor' && state && (
            <SettingSelect
              label={t('devices.deepcool-mystique.readout')}
              value={state.readoutChosen ? state.readout : ''}
              placeholder={t('devices.deepcool-mystique.notSet')}
              options={READOUTS.map(r => ({ value: r, label: t(READOUT_KEYS[r]) }))}
              disabled={!ready}
              onChange={v => edit({ readout: v as MystiqueReadout, readoutChosen: true }, { readout: v as MystiqueReadout })}
            />
          )}

          {chosen && mode === 'recording' && state && (
            <>
              <SettingToggle
                label={t('devices.deepcool-mystique.recordFrequency')}
                description={t(state.recordingChosen ? 'devices.deepcool-mystique.recordingSetHint' : 'devices.deepcool-mystique.recordingUnsetHint')}
                checked={state.recordFrequency}
                disabled={!ready}
                onChange={on => edit({ recordFrequency: on, recordingChosen: true }, { recordFrequency: on })}
              />
              <SettingToggle
                label={t('devices.deepcool-mystique.recordTemperature')}
                checked={state.recordTemperature}
                disabled={!ready}
                onChange={on => edit({ recordTemperature: on, recordingChosen: true }, { recordTemperature: on })}
              />
            </>
          )}
        </SettingsSection>

        <SettingsSection title={t('devices.deepcool-mystique.inputsSection')} boxClassName={styles.sectionBox}>
          {PICKS.map(({ key, type, label, fallback }, i) => (
            <SettingRow key={key} label={t(label)} description={i === 0 ? t('devices.deepcool-mystique.inputsHint') : undefined}>
              {picker(key, type, fallback)}
            </SettingRow>
          ))}
        </SettingsSection>
      </div>
    </div>
  );
}

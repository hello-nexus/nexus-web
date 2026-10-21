import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingRow, SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { ChipGroup } from '../../common/ChipGroup/ChipGroup';
import { Slider } from '../../common/Slider/Slider';
import { useToast } from '../../common/Toast/Toast';
import { SensorPicker, useSensorLookup } from '../../../panel/widgets/monitoring/picker/SensorPicker';
import {
  getMystiqueState,
  setMystiqueSettings,
  type MystiqueMode,
  type MystiqueReadout,
  type MystiqueSensorState,
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
const DEFAULT_CATEGORY = 'motherboard';

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

  const refresh = useCallback(async () => {
    if (busyRef.current > 0) return;
    const next = await getMystiqueState();
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

  const commit = useCallback(async (patch: MystiqueSettingsPatch) => {
    busyRef.current += 1;
    let ok = false;
    try {
      ok = await setMystiqueSettings(patch);
    } catch {
      ok = false;
    } finally {
      busyRef.current -= 1;
    }
    if (!ok) push({ title: t('devices.deepcool-mystique.failedTitle'), body: t('devices.deepcool-mystique.failedBody') });
    const next = await getMystiqueState();
    if (aliveRef.current && next !== null && busyRef.current === 0) setState(next);
  }, [push, t]);

  const edit = useCallback((local: Partial<MystiqueState>, patch: MystiqueSettingsPatch) => {
    setState(prev => prev && { ...prev, ...local });
    void commit(patch);
  }, [commit]);

  const ready = state !== null && state.isConnected;
  const chosen = state?.modeChosen === true;
  const mode = state?.mode ?? 'monitor';

  const picker = (slot: MystiqueSensorState | undefined, onPick: (category: string, sensor: string) => void) => (
    <SensorPicker
      lookup={lookup}
      category={(slot?.sensor ? slot.category : slot?.resolvedCategory) || DEFAULT_CATEGORY}
      sensor={slot?.sensor || slot?.resolvedSensor || ''}
      disabled={!ready}
      onChange={sel => onPick(sel.category, sel.sensor)}
    />
  );

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
            label={t('devices.deepcool-mystique.brightness')}
            ariaLabel={t('devices.deepcool-mystique.brightnessAria')}
            value={state?.brightness ?? 0}
            min={0}
            max={100}
            step={1}
            formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
            disabled={!ready}
            onChange={v => setState(prev => prev && { ...prev, brightness: v })}
            onCommit={v => { void commit({ brightness: v }); }}
          />
          <SettingToggle
            label={t('devices.deepcool-mystique.gyroscope')}
            description={t('devices.deepcool-mystique.gyroscopeHint')}
            checked={state?.gyroscope ?? false}
            disabled={!ready}
            onChange={on => edit({ gyroscope: on }, { gyroscope: on })}
          />
          <SettingToggle
            label={t('devices.deepcool-mystique.rgbSync')}
            description={t('devices.deepcool-mystique.rgbSyncHint')}
            checked={state?.rgbSync ?? false}
            disabled={!ready}
            onChange={on => edit({ rgbSync: on }, { rgbSync: on })}
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
            <SettingRow label={t('devices.deepcool-mystique.mediaHint')} />
          )}

          {chosen && mode === 'monitor' && state && (
            <SettingSelect
              label={t('devices.deepcool-mystique.readout')}
              value={state.readout}
              options={READOUTS.map(r => ({ value: r, label: t(READOUT_KEYS[r]) }))}
              disabled={!ready}
              onChange={v => edit({ readout: v as MystiqueReadout }, { readout: v as MystiqueReadout })}
            />
          )}

          {chosen && mode === 'recording' && state && (
            <>
              <SettingToggle
                label={t('devices.deepcool-mystique.recordFrequency')}
                checked={state.recordFrequency}
                disabled={!ready}
                onChange={on => edit({ recordFrequency: on }, { recordFrequency: on })}
              />
              <SettingToggle
                label={t('devices.deepcool-mystique.recordTemperature')}
                checked={state.recordTemperature}
                disabled={!ready}
                onChange={on => edit({ recordTemperature: on }, { recordTemperature: on })}
              />
            </>
          )}
        </SettingsSection>

        <SettingsSection title={t('devices.deepcool-mystique.inputsSection')} boxClassName={styles.sectionBox}>
          <SettingRow label={t('devices.deepcool-mystique.cpuFan')} description={t('devices.deepcool-mystique.inputsHint')}>
            {picker(state?.cpuFan, (category, sensor) => {
              if (!state) return;
              edit({ cpuFan: { ...state.cpuFan, category, sensor } }, { cpuFan: { category, sensor } });
            })}
          </SettingRow>
          <SettingRow label={t('devices.deepcool-mystique.pump')}>
            {picker(state?.pump, (category, sensor) => {
              if (!state) return;
              edit({ pump: { ...state.pump, category, sensor } }, { pump: { category, sensor } });
            })}
          </SettingRow>
        </SettingsSection>
      </div>
    </div>
  );
}

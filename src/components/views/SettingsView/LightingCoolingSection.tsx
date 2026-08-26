import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { CircuitBoard, Cpu, Lock, Moon, RotateCcw, Zap } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { Select } from '../../common/Select/Select';
import { SettingRow, SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  fetchLockBlackout, fetchRenderGpu, fetchSleepBlackout, restartService, setLockBlackout,
  setRenderGpu, setSleepBlackout,
} from '../../../api/lighting';
import { useSensors, type HardwareSensor } from '../../../hooks/useSensors';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import {
  defaultCpuTempSensor, defaultGpuTempSensor, listTempSensors,
} from '../../../lib/tempSensorResolver';
import {
  convertTemperature, isCelsiusUnit, localizeNumbers, tempUnitSymbol,
  type NumberFormat, type TempUnit,
} from '../../../lib/units';

interface LightingCoolingSectionProps {
  serviceOnline: boolean;
  platform: string;
}

/**
 * Settings home for the lighting + cooling preferences that used to live in the
 * per-page gear modals: the CPU/GPU temperature-sensor overrides (all
 * platforms) and, on Windows/Linux multi-GPU rigs, which GPU renders lighting
 * shaders (restart-to-apply).
 */
export function LightingCoolingSection({ serviceOnline, platform }: LightingCoolingSectionProps) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const sensors = useSensors(serviceOnline);
  const gpus = sensors.gpuComponents;

  const showGpuPicker = (platform === 'windows' || platform === 'linux') && gpus.length > 1;
  const [renderGpu, setRenderGpuValue] = useState('auto');
  const [restartOpen, setRestartOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  // Only Windows notifies the service before the host suspends, which is the
  // one moment black can still be written; elsewhere the setting would be a
  // switch that does nothing. Defaults to the service default (on) so the row
  // never renders off for a moment and reads as a user preference.
  const showSleepBlackout = platform === 'windows';
  const [sleepBlackout, setSleepBlackoutValue] = useState(true);
  // Every desktop OS reports its session lock while still running, so unlike
  // sleep-blackout this is not Windows-only. Defaults to the service default
  // (on) so the row never renders off for a moment and reads as a user choice.
  const showLockBlackout = platform === 'windows' || platform === 'macos' || platform === 'linux';
  const [lockBlackout, setLockBlackoutValue] = useState(true);

  useEffect(() => {
    if (!showGpuPicker || !serviceOnline) return;
    let cancelled = false;
    fetchRenderGpu()
      .then(r => { if (!cancelled) setRenderGpuValue(r?.value || 'auto'); })
      .catch(() => { /* keep default */ });
    return () => { cancelled = true; };
  }, [showGpuPicker, serviceOnline]);

  useEffect(() => {
    if (!showSleepBlackout || !serviceOnline) return;
    let cancelled = false;
    fetchSleepBlackout()
      .then(r => { if (!cancelled && r) setSleepBlackoutValue(!!r.enabled); })
      .catch(() => { /* keep default */ });
    return () => { cancelled = true; };
  }, [showSleepBlackout, serviceOnline]);

  useEffect(() => {
    if (!showLockBlackout || !serviceOnline) return;
    let cancelled = false;
    fetchLockBlackout()
      .then(r => { if (!cancelled && r) setLockBlackoutValue(!!r.enabled); })
      .catch(() => { /* keep default */ });
    return () => { cancelled = true; };
  }, [showLockBlackout, serviceOnline]);

  const cpuOptions = useMemo(() => listTempSensors(sensors.cpu), [sensors.cpu]);
  const gpuOptions = useMemo(() => listTempSensors(sensors.gpu), [sensors.gpu]);
  const cpuDefault = useMemo(() => defaultCpuTempSensor(sensors.cpu), [sensors.cpu]);
  const gpuDefault = useMemo(() => defaultGpuTempSensor(sensors.gpu), [sensors.gpu]);

  const handleGpuChange = async (value: string) => {
    setRenderGpuValue(value);
    try { await setRenderGpu(value); } catch { /* persist may retry; UI keeps the pick */ }
    setRestartOpen(true);
  };
  const handleSleepBlackoutChange = async (next: boolean) => {
    setSleepBlackoutValue(next);
    try { await setSleepBlackout(next); }
    catch { setSleepBlackoutValue(!next); }
  };
  const handleLockBlackoutChange = async (next: boolean) => {
    setLockBlackoutValue(next);
    try { await setLockBlackout(next); }
    catch { setLockBlackoutValue(!next); }
  };
  const handleRestart = async () => {
    try { await restartService(); } catch { /* the socket drops as the service restarts */ }
    setRestartOpen(false);
  };

  const canReset = settings.preferredCpuTempSensorId !== '' || settings.preferredGpuTempSensorId !== '';
  const doReset = () => {
    update({ preferredCpuTempSensorId: '', preferredGpuTempSensorId: '' });
    setResetOpen(false);
  };

  // Auto = the OS default offscreen-GL adapter (integrated on a hybrid rig);
  // show its name so the user sees where Auto lands, like the monitoring picker.
  const autoName = gpus.find(g => g.integrated)?.name ?? gpus[0]?.name ?? '';
  const gpuSelectOptions = [
    {
      value: 'auto',
      label: autoName ? t('monitoring.gpuSelect.auto', { name: autoName }) : t('lighting.renderGpu.auto'),
    },
    { value: '__sep__', label: '', divider: true },
    ...gpus.map(g => ({
      value: g.name,
      label: g.integrated ? `${g.name} (${t('monitoring.gpuSelect.integrated')})` : g.name,
    })),
  ];

  const resetAction = canReset ? (
    <Button
      type="button"
      tone="ghost"
      size="sm"
      icon={<RotateCcw size={13} />}
      onClick={() => setResetOpen(true)}
    >
      {t('cooling.settings.reset')}
    </Button>
  ) : undefined;

  return (
    <>
      <SettingsSection title={t('settings.lightingCooling.title')} action={resetAction}>
        {showGpuPicker && (
          <SettingSelect
            label={t('lighting.renderGpu.label')}
            icon={<Zap />}
            iconLeading="subtle"
            anchorId="set-render-gpu"
            description={t('lighting.renderGpu.hint')}
            value={renderGpu}
            options={gpuSelectOptions}
            onChange={handleGpuChange}
          />
        )}
        {showSleepBlackout && (
          <SettingToggle
            label={t('lighting.sleepBlackout.label')}
            icon={<Moon />}
            iconLeading="subtle"
            anchorId="set-sleep-blackout"
            description={t('lighting.sleepBlackout.description')}
            checked={sleepBlackout}
            onChange={handleSleepBlackoutChange}
            disabled={!serviceOnline}
          />
        )}
        {showLockBlackout && (
          <SettingToggle
            label={t('lighting.lockBlackout.label')}
            icon={<Lock />}
            iconLeading="subtle"
            anchorId="set-lock-blackout"
            description={t('lighting.lockBlackout.description')}
            checked={lockBlackout}
            onChange={handleLockBlackoutChange}
            disabled={!serviceOnline}
          />
        )}
        <SensorRow
          icon={<Cpu />}
          label={t('cooling.settings.cpuLabel')}
          anchorId="set-cpu-sensor"
          options={cpuOptions}
          defaultSensor={cpuDefault}
          defaultSuffix={t('cooling.settings.defaultSuffix')}
          emptyLabel={t('cooling.settings.empty')}
          value={settings.preferredCpuTempSensorId}
          tempUnit={settings.monitoringTempUnit}
          numberFormat={settings.numberFormat}
          onChange={id => update({ preferredCpuTempSensorId: id })}
        />
        <SensorRow
          icon={<CircuitBoard />}
          label={t('cooling.settings.gpuLabel')}
          anchorId="set-gpu-sensor"
          options={gpuOptions}
          defaultSensor={gpuDefault}
          defaultSuffix={t('cooling.settings.defaultSuffix')}
          emptyLabel={t('cooling.settings.empty')}
          value={settings.preferredGpuTempSensorId}
          tempUnit={settings.monitoringTempUnit}
          numberFormat={settings.numberFormat}
          onChange={id => update({ preferredGpuTempSensorId: id })}
        />
      </SettingsSection>
      <ConfirmModal
        open={restartOpen}
        title={t('lighting.renderGpu.confirmTitle')}
        message={t('lighting.renderGpu.confirmMessage')}
        confirmLabel={t('lighting.renderGpu.confirmButton')}
        destructive={false}
        onConfirm={handleRestart}
        onCancel={() => setRestartOpen(false)}
      />
      <ConfirmModal
        open={resetOpen}
        title={t('cooling.settings.reset')}
        message={t('settings.lightingCooling.resetConfirm')}
        confirmLabel={t('cooling.settings.reset')}
        destructive
        onConfirm={doReset}
        onCancel={() => setResetOpen(false)}
      />
    </>
  );
}

interface SensorRowProps {
  icon?: ReactNode;
  label: string;
  /** Search deep-link target stamped on the row (SettingRow anchorId). */
  anchorId?: string;
  options: readonly HardwareSensor[];
  /** Sensor the auto picker would land on. Marked "(default)" in the list. */
  defaultSensor?: HardwareSensor;
  defaultSuffix: string;
  emptyLabel: string;
  /** Stored preference: "" = auto, shown as the default sensor's id. */
  value: string;
  tempUnit: TempUnit;
  numberFormat: NumberFormat;
  onChange: (id: string) => void;
}

function SensorRow({ label, anchorId, icon, options, defaultSensor, defaultSuffix, emptyLabel, value, tempUnit, numberFormat, onChange }: SensorRowProps) {
  // The visible option list must include both the stored pick and the default
  // sensor, or the controlled <select> would carry a value with no matching
  // <option> and snap to the first one (then persist it on the next change).
  const visibleOptions = useMemo<HardwareSensor[]>(() => {
    const out: HardwareSensor[] = [...options];
    const ids = new Set(out.map(s => s.id));
    if (defaultSensor && !ids.has(defaultSensor.id)) {
      out.unshift(defaultSensor);
      ids.add(defaultSensor.id);
    }
    // A previously-pinned sensor that stopped reporting surfaces as a disabled
    // "(unavailable)" row so the select can still display the stored id.
    if (value && !ids.has(value)) {
      out.push({
        id: value,
        name: value,
        type: 'Temperature',
        value: 0,
        units: '',
        formatted: '',
        parent: { id: '', name: '' },
      });
    }
    return out;
  }, [options, defaultSensor, value]);

  // Empty preference (auto) selects the default sensor's id visually while the
  // stored value stays empty, so future default-picker changes still propagate.
  const displayedValue = value || defaultSensor?.id || '';
  const handleChange = (next: string) => {
    onChange(next === defaultSensor?.id ? '' : next);
  };

  if (visibleOptions.length === 0) {
    return <SettingRow label={label} anchorId={anchorId} icon={icon} iconLeading="subtle" description={emptyLabel} />;
  }

  return (
    <SettingRow label={label} anchorId={anchorId} icon={icon} iconLeading="subtle">
      <Select value={displayedValue} onChange={handleChange} ariaLabel={label}>
        {visibleOptions.map(s => {
          const isDefault = s.id === defaultSensor?.id;
          const isMissing = s.parent.id === '' && s.parent.name === '';
          const suffix = isDefault ? defaultSuffix : '';
          const optLabel = isMissing
            ? `${s.name} (unavailable)`
            : `${s.name} (${formatReading(s, tempUnit, numberFormat)})${suffix}`;
          return (
            <option key={s.id} value={s.id} disabled={isMissing}>
              {optLabel}
            </option>
          );
        })}
      </Select>
    </SettingRow>
  );
}

/**
 * A picker row's live reading, in the user's chosen temperature unit. The
 * default-sensor fallback matches on id substring, so a listed sensor is not
 * guaranteed to be a Celsius reading - those keep the service's own string.
 */
function formatReading(s: HardwareSensor, tempUnit: TempUnit, numberFormat: NumberFormat): string {
  if (!isCelsiusUnit(s.units)) return localizeNumbers(s.formatted, numberFormat);
  const value = convertTemperature(s.value, tempUnit).toFixed(1);
  return `${localizeNumbers(value, numberFormat)}${tempUnitSymbol(tempUnit)}`;
}

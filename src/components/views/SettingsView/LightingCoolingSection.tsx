import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { Select } from '../../common/Select/Select';
import { SettingRow, SettingSelect } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { fetchRenderGpu, restartService, setRenderGpu } from '../../../api/lighting';
import { useSensors, type HardwareSensor } from '../../../hooks/useSensors';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import {
  defaultCpuTempSensor, defaultGpuTempSensor, listTempSensors,
} from '../../../lib/tempSensorResolver';
import { localizeNumbers, type NumberFormat } from '../../../lib/units';

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

  useEffect(() => {
    if (!showGpuPicker || !serviceOnline) return;
    let cancelled = false;
    fetchRenderGpu()
      .then(r => { if (!cancelled) setRenderGpuValue(r?.value || 'auto'); })
      .catch(() => { /* keep default */ });
    return () => { cancelled = true; };
  }, [showGpuPicker, serviceOnline]);

  const cpuOptions = useMemo(() => listTempSensors(sensors.cpu), [sensors.cpu]);
  const gpuOptions = useMemo(() => listTempSensors(sensors.gpu), [sensors.gpu]);
  const cpuDefault = useMemo(() => defaultCpuTempSensor(sensors.cpu), [sensors.cpu]);
  const gpuDefault = useMemo(() => defaultGpuTempSensor(sensors.gpu), [sensors.gpu]);

  const handleGpuChange = async (value: string) => {
    setRenderGpuValue(value);
    try { await setRenderGpu(value); } catch { /* persist may retry; UI keeps the pick */ }
    setRestartOpen(true);
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
            anchorId="set-render-gpu"
            description={t('lighting.renderGpu.hint')}
            value={renderGpu}
            options={gpuSelectOptions}
            onChange={handleGpuChange}
          />
        )}
        <SensorRow
          label={t('cooling.settings.cpuLabel')}
          anchorId="set-cpu-sensor"
          options={cpuOptions}
          defaultSensor={cpuDefault}
          defaultSuffix={t('cooling.settings.defaultSuffix')}
          emptyLabel={t('cooling.settings.empty')}
          value={settings.preferredCpuTempSensorId}
          numberFormat={settings.numberFormat}
          onChange={id => update({ preferredCpuTempSensorId: id })}
        />
        <SensorRow
          label={t('cooling.settings.gpuLabel')}
          anchorId="set-gpu-sensor"
          options={gpuOptions}
          defaultSensor={gpuDefault}
          defaultSuffix={t('cooling.settings.defaultSuffix')}
          emptyLabel={t('cooling.settings.empty')}
          value={settings.preferredGpuTempSensorId}
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
  numberFormat: NumberFormat;
  onChange: (id: string) => void;
}

function SensorRow({ label, anchorId, options, defaultSensor, defaultSuffix, emptyLabel, value, numberFormat, onChange }: SensorRowProps) {
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
    return <SettingRow label={label} anchorId={anchorId} description={emptyLabel} />;
  }

  return (
    <SettingRow label={label} anchorId={anchorId}>
      <Select value={displayedValue} onChange={handleChange} ariaLabel={label}>
        {visibleOptions.map(s => {
          const isDefault = s.id === defaultSensor?.id;
          const isMissing = s.parent.id === '' && s.parent.name === '';
          const suffix = isDefault ? defaultSuffix : '';
          const optLabel = isMissing
            ? `${s.name} (unavailable)`
            : `${s.name} (${localizeNumbers(s.value.toFixed(1), numberFormat)}°C)${suffix}`;
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

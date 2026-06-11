import { useUiSettings } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import { resolvePrimaryGpu, type GpuComponent } from '../../../../lib/gpuResolver';
import styles from '../MonitoringPage.module.scss';

/**
 * Picks the "primary" GPU shown across the Monitoring widget, sensors view, and
 * GPU temp display. Stored globally as `cooling.preferredGpuId` (the GPU model
 * name); the "Auto" option clears it back to the discrete-first default. The
 * caller only mounts this when more than one GPU is present.
 */
export function GpuSelect({ gpus }: { gpus: GpuComponent[] }) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();

  // What "Auto" lands on right now, so the user can see the default's effect.
  const autoName = resolvePrimaryGpu(gpus, '')?.name ?? '';

  const options: SelectOption[] = [
    { value: '', label: t('monitoring.gpuSelect.auto', { name: autoName }) },
    ...gpus.map(g => ({
      value: g.name,
      label: g.integrated ? `${g.name} (${t('monitoring.gpuSelect.integrated')})` : g.name,
    })),
  ];

  return (
    <label className={styles.gpuSelect}>
      <span className={styles.gpuSelectLabel}>{t('monitoring.gpuSelect.label')}</span>
      <Select
        value={settings.preferredGpuId}
        onChange={v => update({ preferredGpuId: v })}
        options={options}
        ariaLabel={t('monitoring.gpuSelect.label')}
      />
    </label>
  );
}

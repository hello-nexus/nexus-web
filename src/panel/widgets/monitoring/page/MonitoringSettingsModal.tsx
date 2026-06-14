import { useUiSettings } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import { resolvePrimaryGpu, type GpuComponent } from '../../../../lib/gpuResolver';
import styles from './MonitoringSettingsModal.module.scss';

interface MonitoringSettingsModalProps {
  open: boolean;
  onClose: () => void;
  gpus: GpuComponent[];
}

/**
 * Settings dialog for the monitoring page. Its only control is the primary-GPU
 * picker - which GPU's stats stand in across the Monitoring widget, sensors
 * view, and GPU temp display. Stored globally as `preferredGpuId` (the GPU
 * model name); the "Auto" option clears it back to the discrete-first default.
 * The caller only registers the settings affordance when more than one GPU is
 * present (nothing to choose otherwise).
 */
export function MonitoringSettingsModal({ open, onClose, gpus }: MonitoringSettingsModalProps) {
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

  if (!open) return null;

  return (
    <Overlay open={open} onClose={onClose} variant="dialog"
      className={styles.modal} ariaLabel={t('monitoring.settings.title')}>
      <h2 className={styles.title}>{t('monitoring.settings.title')}</h2>
      <p className={styles.description}>{t('monitoring.settings.description')}</p>

      <label className={styles.row}>
        <span className={styles.rowLabel}>{t('monitoring.gpuSelect.label')}</span>
        <Select
          className={styles.select}
          value={settings.preferredGpuId}
          onChange={v => update({ preferredGpuId: v })}
          options={options}
          ariaLabel={t('monitoring.gpuSelect.label')}
        />
      </label>

      <div className={styles.actions}>
        <button type="button" className={styles.confirmBtn} onClick={onClose}>
          {t('monitoring.settings.close')}
        </button>
      </div>
    </Overlay>
  );
}

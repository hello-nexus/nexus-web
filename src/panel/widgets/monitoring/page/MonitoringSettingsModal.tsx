import { useUiSettings } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { Button } from '../../../../components/common/Button/Button';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import { resolvePrimaryGpu, type GpuComponent } from '../../../../lib/gpuResolver';
import { MonitoringEventsSettings } from './MonitoringEventsSettings';
import styles from './MonitoringSettingsModal.module.scss';

interface MonitoringSettingsModalProps {
  open: boolean;
  onClose: () => void;
  gpus: GpuComponent[];
}

/**
 * Settings dialog for the monitoring page: the primary-GPU picker (which
 * GPU's stats stand in across the Monitoring widget, sensors view, and GPU
 * temp display, stored globally as `preferredGpuId`; "Auto" clears it back to
 * the discrete-first default) and which timeline event kinds the graph shows.
 * The GPU row is hidden when there is only one GPU, so the dialog is always
 * worth opening for the event toggles.
 */
export function MonitoringSettingsModal({ open, onClose, gpus }: MonitoringSettingsModalProps) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();

  // What "Auto" lands on right now, so the user can see the default's effect.
  const autoName = resolvePrimaryGpu(gpus, '')?.name ?? '';

  const options: SelectOption[] = [
    { value: '', label: t('monitoring.gpuSelect.auto', { name: autoName }) },
    { value: '__sep__', label: '', divider: true },
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

      {gpus.length > 1 && (
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
      )}

      <MonitoringEventsSettings />

      <div className={styles.actions}>
        <Button tone="accent" onClick={onClose}>
          {t('monitoring.settings.close')}
        </Button>
      </div>
    </Overlay>
  );
}

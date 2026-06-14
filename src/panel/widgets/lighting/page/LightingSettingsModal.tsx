import { useEffect, useState } from 'react';
import { resetDeviceLayouts, fetchRenderGpu, setRenderGpu, restartService } from '../../../../api/lighting';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { Button } from '../../../../components/common/Button/Button';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import type { GpuComponent } from '../../../../lib/gpuResolver';
import { useTranslation } from '../../../../lib/i18n';
import { GlobalBrightnessSlider } from './GlobalBrightnessSlider';
import styles from './LightingSettingsModal.module.scss';

interface LightingSettingsModalProps {
  open: boolean;
  onClose: () => void;
  serviceOnline: boolean;
  platform?: string;
  gpus?: GpuComponent[];
}

/**
 * Settings dialog for the lighting page: master brightness, an optional
 * render-GPU picker (which card runs the lighting shaders, Windows/Linux with
 * 2+ GPUs only), and a "reset positions" action. The render-GPU choice is
 * restart-to-apply, so changing it opens a restart confirm.
 */
export function LightingSettingsModal({
  open, onClose, serviceOnline, platform = '', gpus = [],
}: LightingSettingsModalProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [renderGpu, setRenderGpuValue] = useState('auto');
  const [restartOpen, setRestartOpen] = useState(false);

  // Only meaningful on Windows/Linux with more than one GPU to choose between.
  const showGpuPicker = (platform === 'windows' || platform === 'linux') && gpus.length > 1;

  useEffect(() => {
    if (!open) { setConfirmOpen(false); setResetting(false); setRestartOpen(false); }
  }, [open]);

  useEffect(() => {
    if (!open || !showGpuPicker || !serviceOnline) return;
    let cancelled = false;
    fetchRenderGpu()
      .then(r => { if (!cancelled) setRenderGpuValue(r?.value || 'auto'); })
      .catch(() => { /* keep default */ });
    return () => { cancelled = true; };
  }, [open, showGpuPicker, serviceOnline]);

  const handleReset = async () => {
    setResetting(true);
    try { await resetDeviceLayouts(); }
    finally { setResetting(false); setConfirmOpen(false); }
  };

  const handleGpuChange = async (value: string) => {
    setRenderGpuValue(value);
    try { await setRenderGpu(value); } catch { /* persist may retry; UI keeps the pick */ }
    setRestartOpen(true);
  };

  const handleRestart = async () => {
    try { await restartService(); } catch { /* the socket drops as the service restarts */ }
    setRestartOpen(false);
  };

  if (!open) return null;

  // Auto = the OS default for offscreen GL, which on a hybrid rig is the
  // integrated GPU. Show that card so the user sees what Auto lands on, like the
  // monitoring GPU picker does.
  const autoName = gpus.find(g => g.integrated)?.name ?? gpus[0]?.name ?? '';
  const gpuOptions: SelectOption[] = [
    {
      value: 'auto',
      label: autoName ? t('monitoring.gpuSelect.auto', { name: autoName }) : t('lighting.renderGpu.auto'),
    },
    ...gpus.map(g => ({
      value: g.name,
      label: g.integrated ? `${g.name} (${t('monitoring.gpuSelect.integrated')})` : g.name,
    })),
  ];

  return (
    <>
      <Overlay open={open} onClose={onClose} variant="dialog"
        className={styles.modal} ariaLabel={t('lighting.settings.title')}
        noEscDismiss={confirmOpen || restartOpen}>
        <h2 className={styles.title}>{t('lighting.settings.title')}</h2>
        <p className={styles.description}>{t('lighting.settings.description')}</p>

        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('lighting.settings.brightnessLabel')}</span>
          <div className={styles.brightnessControl}>
            <GlobalBrightnessSlider serviceOnline={serviceOnline} />
          </div>
        </div>

        {showGpuPicker && (
          <label className={styles.row}>
            <div className={styles.resetLabelGroup}>
              <span className={styles.rowLabel}>{t('lighting.renderGpu.label')}</span>
              <span className={styles.resetHint}>{t('lighting.renderGpu.hint')}</span>
            </div>
            <Select
              className={styles.select}
              value={renderGpu}
              onChange={handleGpuChange}
              options={gpuOptions}
              ariaLabel={t('lighting.renderGpu.label')}
            />
          </label>
        )}

        <div className={styles.row}>
          <div className={styles.resetLabelGroup}>
            <span className={styles.rowLabel}>{t('lighting.settings.resetLayoutsLabel')}</span>
            <span className={styles.resetHint}>{t('lighting.settings.resetLayoutsHint')}</span>
          </div>
          <Button
            type="button"
            tone="danger"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={resetting}
          >
            {t('lighting.settings.resetLayouts')}
          </Button>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.confirmBtn} onClick={onClose}>
            {t('lighting.settings.close')}
          </button>
        </div>
      </Overlay>
      <ConfirmModal
        open={confirmOpen}
        title={t('lighting.settings.resetLayoutsLabel')}
        message={t('lighting.settings.resetConfirmMessage')}
        confirmLabel={t('lighting.settings.resetLayouts')}
        destructive
        onConfirm={handleReset}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmModal
        open={restartOpen}
        title={t('lighting.renderGpu.confirmTitle')}
        message={t('lighting.renderGpu.confirmMessage')}
        confirmLabel={t('lighting.renderGpu.confirmButton')}
        destructive={false}
        onConfirm={handleRestart}
        onCancel={() => setRestartOpen(false)}
      />
    </>
  );
}

import { useEffect, useState } from 'react';
import { resetDeviceLayouts } from '../../../../api/lighting';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { Button } from '../../../../components/common/Button/Button';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { useTranslation } from '../../../../lib/i18n';
import { GlobalBrightnessSlider } from './GlobalBrightnessSlider';
import styles from './LightingSettingsModal.module.scss';

interface LightingSettingsModalProps {
  open: boolean;
  onClose: () => void;
  serviceOnline: boolean;
}

/**
 * Settings dialog for the lighting page. Hosts the master brightness slider
 * (previously inline in the page header) plus a "reset positions" affordance
 * that clears every persisted canvas position/size/rotation. Matches the
 * cooling page's settings modal pattern so the two surfaces feel like a set.
 */
export function LightingSettingsModal({ open, onClose, serviceOnline }: LightingSettingsModalProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Reset the destructive-confirm flow whenever the parent modal closes.
  // Guards against a "Done" click while ConfirmModal is open leaving stale
  // confirmOpen=true that would flash the confirm back up on next open.
  useEffect(() => {
    if (!open) { setConfirmOpen(false); setResetting(false); }
  }, [open]);

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetDeviceLayouts();
    } finally {
      setResetting(false);
      setConfirmOpen(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <Overlay open={open} onClose={onClose} variant="dialog"
        className={styles.modal} ariaLabel={t('lighting.settings.title')}
        noEscDismiss={confirmOpen}>
        <h2 className={styles.title}>{t('lighting.settings.title')}</h2>
        <p className={styles.description}>{t('lighting.settings.description')}</p>

        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('lighting.settings.brightnessLabel')}</span>
          <div className={styles.brightnessControl}>
            <GlobalBrightnessSlider serviceOnline={serviceOnline} />
          </div>
        </div>

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
    </>
  );
}

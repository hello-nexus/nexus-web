import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { DeviceModal } from '../../../../components/common/DeviceModal/DeviceModal';
import { Button } from '../../../../components/common/Button/Button';
import { ChipGroup } from '../../../../components/common/ChipGroup/ChipGroup';
import { AppPicker } from '../../common/AppPicker';
import type { PresetApp } from '../../../../api/lighting';
import styles from './PresetAppsModal.module.scss';

interface PresetAppsModalProps {
  presetName: string;
  apps: PresetApp[];
  onSave: (apps: PresetApp[]) => Promise<void> | void;
  onClose: () => void;
}

/** Picks the apps whose focus activates a lighting preset. Selection is local
 *  until Save: assigning an app unbinds it from whichever preset held it.
 *
 *  Mounted only while open, and `apps` seeds state once: the caller passes a
 *  snapshot taken when the modal opened, so a preset the service activates on
 *  a focus change cannot move the save target out from under an open edit. */
export function PresetAppsModal({ presetName, apps, onSave, onClose }: PresetAppsModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<PresetApp[]>(apps);
  const [saving, setSaving] = useState(false);

  const toggle = (app: PresetApp) => {
    setSelected(prev => prev.some(a => a.id === app.id)
      ? prev.filter(a => a.id !== app.id)
      : [...prev, app]);
  };

  return (
    <DeviceModal
      open
      onClose={onClose}
      title={t('lighting.layoutPresets.appsTitle', { name: presetName })}
      medium
    >
      <div className={styles.body}>
        <p className={styles.hint}>{t('lighting.layoutPresets.appsHint')}</p>
        {selected.length > 0 && (
          // Every chip is bound, so they all read active; clicking one unbinds it.
          <ChipGroup
            multiSelect
            ariaLabel={t('lighting.layoutPresets.appsTitle', { name: presetName })}
            activeKeys={new Set(selected.map(a => a.id))}
            options={selected.map(app => ({
              key: app.id,
              ariaLabel: t('lighting.layoutPresets.appsRemove', { name: app.name }),
              label: (
                <span className={styles.chipLabel}>
                  {app.name}
                  <X size={12} aria-hidden />
                </span>
              ),
            }))}
            onToggleKey={key => {
              const app = selected.find(a => a.id === key);
              if (app) toggle(app);
            }}
          />
        )}
        <AppPicker
          selectedIds={selected.map(a => a.id)}
          onSelect={toggle}
          showRunning
        />
        <div className={styles.actions}>
          <Button tone="ghost" onClick={onClose} disabled={saving}>{t('confirm.cancel')}</Button>
          <Button
            tone="accent"
            disabled={saving}
            onClick={() => {
              // Stays open until the write lands, so a failed PUT does not
              // discard the edit silently.
              setSaving(true);
              void Promise.resolve(onSave(selected)).finally(() => setSaving(false));
            }}
          >
            {t('lighting.layoutPresets.appsSave')}
          </Button>
        </div>
      </div>
    </DeviceModal>
  );
}

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
  /** Apps other presets already trigger, keyed by id and by resolved process
   *  name, valued with the owning preset's name. */
  taken: Record<string, string>;
  /** Resolves to a conflict message when the server refused the save. */
  onSave: (apps: PresetApp[]) => Promise<string | null> | string | null;
  onClose: () => void;
}

/** Picks the apps whose focus activates a lighting preset. Selection is local
 *  until Save: assigning an app unbinds it from whichever preset held it.
 *
 *  Mounted only while open, and `apps` seeds state once: the caller passes a
 *  snapshot taken when the modal opened, so a preset the service activates on
 *  a focus change cannot move the save target out from under an open edit. */
export function PresetAppsModal({ presetName, apps, taken, onSave, onClose }: PresetAppsModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<PresetApp[]>(apps);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);

  const ownerOf = (app: PresetApp): string | undefined =>
    taken[app.id] ?? (app.processName ? taken[app.processName] : undefined);

  const toggle = (app: PresetApp) => {
    const already = selected.some(a => a.id === app.id);
    if (!already) {
      // An app triggers one preset; say which one rather than stealing it.
      const owner = ownerOf(app);
      if (owner) {
        setAlert(t('lighting.layoutPresets.appsTaken', { app: app.name, preset: owner }));
        return;
      }
    }
    setAlert(null);
    setSelected(prev => already
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
        {alert && <p className={styles.alert} role="alert">{alert}</p>}
        {selected.length > 0 && (
          <div className={styles.chipRow}>
            {/* Every chip is bound, so they all read active; clicking one unbinds it. */}
            <ChipGroup
              wrap
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
            <Button
              tone="ghost"
              size="sm"
              onClick={() => setSelected([])}
              className={styles.clearAll}
            >
              {t('lighting.layoutPresets.appsClear')}
            </Button>
          </div>
        )}
        <AppPicker
          selectedIds={selected.map(a => a.id)}
          unavailableIds={Object.fromEntries(Object.entries(taken).map(
            ([key, owner]) => [key, t('lighting.layoutPresets.appsTakenShort', { preset: owner })],
          ))}
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
              void Promise.resolve(onSave(selected))
                .then(conflict => { if (conflict) setAlert(conflict); })
                .finally(() => setSaving(false));
            }}
          >
            {t('lighting.layoutPresets.appsSave')}
          </Button>
        </div>
      </div>
    </DeviceModal>
  );
}

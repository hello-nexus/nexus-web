import { useState } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { DeviceModal } from '../../../../components/common/DeviceModal/DeviceModal';
import { Button } from '../../../../components/common/Button/Button';
import { Notice } from '../../../../components/common/Notice/Notice';
import { AppPicker } from '../../common/AppPicker';
import { AppChipRow } from '../../common/AppChipRow';
import type { PresetApp } from '../../../../api/lighting';
import styles from './PresetAppsModal.module.scss';

interface PresetAppsModalProps {
  presetName: string;
  /** Overrides of the lighting-preset copy, for callers that bind apps to something else. */
  title?: string;
  hint?: string;
  removeLabel?: (name: string) => string;
  clearLabel?: string;
  saveLabel?: string;
  apps: PresetApp[];
  /** Apps other presets already trigger, keyed by id and by resolved process
   *  name, valued with the owning preset's name. */
  taken?: Record<string, string>;
  /** Resolves to why the save did not land, or null once it did. */
  onSave: (apps: PresetApp[]) => Promise<PresetAppsSaveError | null> | PresetAppsSaveError | null;
  onClose: () => void;
}

/** A refused save: `failed` marks a write that did not land (offline, 4xx/5xx), not a conflict. */
export interface PresetAppsSaveError {
  message: string;
  failed: boolean;
}

/** Picks the apps that activate something: a lighting preset by default, or
 *  whatever the caller labels through `title`, `hint` and the label props.
 *  Selection is local until Save. With a `taken` map, assigning an app another
 *  owner holds is refused with a notice; without one, apps are free to share.
 *
 *  Mounted only while open, and `apps` seeds state once: the caller passes a
 *  snapshot taken when the modal opened, so an activation the service makes on
 *  a focus change cannot move the save target out from under an open edit. */
export function PresetAppsModal({ presetName, title, hint, removeLabel, clearLabel, saveLabel, apps, taken = {}, onSave, onClose }: PresetAppsModalProps) {
  const { t } = useTranslation();
  const heading = title ?? t('lighting.layoutPresets.appsTitle', { name: presetName });
  const [selected, setSelected] = useState<PresetApp[]>(apps);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ message: string; tone: 'warning' | 'critical' } | null>(null);

  const ownerOf = (app: PresetApp): string | undefined =>
    taken[app.id] ?? (app.processName ? taken[app.processName] : undefined);

  const toggle = (app: PresetApp) => {
    const already = selected.some(a => a.id === app.id);
    if (!already) {
      // An app triggers one preset; say which one rather than stealing it.
      const owner = ownerOf(app);
      if (owner) {
        setAlert({ message: t('lighting.layoutPresets.appsTaken', { app: app.name, preset: owner }), tone: 'warning' });
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
      title={heading}
      medium
    >
      <div className={styles.body}>
        <p className={styles.hint}>{hint ?? t('lighting.layoutPresets.appsHint')}</p>
        {alert && <Notice tone={alert.tone} role="alert">{alert.message}</Notice>}
        {selected.length > 0 && (
          <div className={styles.chipRow}>
            <AppChipRow
              apps={selected}
              ariaLabel={heading}
              removeLabel={removeLabel ?? (name => t('lighting.layoutPresets.appsRemove', { name }))}
              onRemove={key => {
                const app = selected.find(x => x.id === key);
                if (app) toggle(app);
              }}
            />
            <Button
              tone="ghost"
              size="sm"
              onClick={() => setSelected([])}
              className={styles.clearAll}
            >
              {clearLabel ?? t('lighting.layoutPresets.appsClear')}
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
                .then(error => { if (error) setAlert({ message: error.message, tone: error.failed ? 'critical' : 'warning' }); })
                .finally(() => setSaving(false));
            }}
          >
            {saveLabel ?? t('lighting.layoutPresets.appsSave')}
          </Button>
        </div>
      </div>
    </DeviceModal>
  );
}

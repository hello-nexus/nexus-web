import { useCallback, useEffect, useState } from 'react';
import { Check, Laptop } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { Spinner } from '../../common/Spinner/Spinner';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import {
  fetchCloudLibrary, fetchCloudImportPreview, importCloudProfile,
  type CloudImportPreview, type CloudLibraryMachine, type CloudLibraryProfile,
} from '../../../api/cloud';
import type { ProfileCategory } from '../../../api/profiles';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import { CATEGORY_ICONS } from './SharingSection';
import styles from './SettingsView.module.scss';

interface ImportFromMachinePanelProps {
  /** Local profile the chosen categories overwrite; the service falls back to the active one when omitted. */
  targetProfileId?: string;
  targetProfileName: string;
  onImported: () => void;
  onClose: () => void;
}

type Step =
  | { kind: 'machines' }
  | { kind: 'profiles'; machine: CloudLibraryMachine }
  | { kind: 'categories'; machine: CloudLibraryMachine; profile: CloudLibraryProfile };

function formatSize(bytes: number): string {
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
}

/** Machine -> profile -> categories. Each accepted category REPLACES that category of the local profile wholesale; anything left off is untouched. */
export function ImportFromMachinePanel({
  targetProfileId, targetProfileName, onImported, onClose,
}: ImportFromMachinePanelProps) {
  const { t, language } = useTranslation();
  const [step, setStep] = useState<Step>({ kind: 'machines' });
  const [machines, setMachines] = useState<CloudLibraryMachine[] | null>(null);
  const [preview, setPreview] = useState<CloudImportPreview | null>(null);
  const [selected, setSelected] = useState<ProfileCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCloudLibrary()
      .then(data => {
        if (cancelled) return;
        setMachines((data?.machines ?? []).filter(m => !m.isThisMachine && m.profiles.length > 0));
      })
      .catch(() => { if (!cancelled) setError(t('profile.cloud.import.error.load')); });
    return () => { cancelled = true; };
  }, [t]);

  const openProfile = useCallback(async (machine: CloudLibraryMachine, profile: CloudLibraryProfile) => {
    setStep({ kind: 'categories', machine, profile });
    setPreview(null);
    setError(null);
    try {
      const data = await fetchCloudImportPreview(machine.installId, profile.profileId);
      setPreview(data ?? null);
      // An import overwrites, so every category is an explicit opt-in.
      setSelected([]);
    } catch {
      setError(t('profile.cloud.import.error.load'));
    }
  }, [t]);

  const toggle = (category: ProfileCategory) => {
    setSelected(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
  };

  const confirm = async () => {
    if (step.kind !== 'categories' || selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const result = await importCloudProfile(
      step.machine.installId, step.profile.profileId, selected, targetProfileId,
    );
    setBusy(false);
    if (!result || result.error) {
      setError(t('profile.cloud.import.error.failed'));
      return;
    }
    onImported();
    onClose();
  };

  const unknown = t('profile.cloud.machine.unknown');

  if (error && machines === null) {
    return <p className={styles.profileImportError} role="alert" data-settings-aside="true">{error}</p>;
  }

  return (
    <>
      {error && <p className={styles.profileImportError} role="alert" data-settings-aside="true">{error}</p>}

      {step.kind === 'machines' && (
        machines === null ? <Spinner size={24} /> : machines.length === 0 ? (
          <EmptyState
            icon={<Laptop />}
            title={t('profile.cloud.import.noMachines.title')}
            hint={t('profile.cloud.import.noMachines.hint')}
            compact
          />
        ) : (
          machines.map(machine => (
            <SettingRow
              key={machine.installId}
              label={machine.hostname || unknown}
              description={t(pluralKey('profile.cloud.import.profileCount', language, machine.profiles.length), { count: machine.profiles.length })}
            >
              <Button type="button" tone="neutral" size="sm" onClick={() => setStep({ kind: 'profiles', machine })}>
                {t('profile.cloud.import.choose')}
              </Button>
            </SettingRow>
          ))
        )
      )}

      {step.kind === 'profiles' && (
        <>
          {step.machine.profiles.map(profile => (
            <SettingRow
              key={profile.profileId}
              label={profile.name}
              description={profile.updatedAt ? new Date(profile.updatedAt).toLocaleString() : ''}
            >
              <Button type="button" tone="neutral" size="sm" onClick={() => void openProfile(step.machine, profile)}>
                {t('profile.cloud.import.choose')}
              </Button>
            </SettingRow>
          ))}
          <div className={styles.profileActions}>
            <Button type="button" tone="ghost" size="sm" onClick={() => setStep({ kind: 'machines' })}>
              {t('profile.cloud.import.back')}
            </Button>
          </div>
        </>
      )}

      {step.kind === 'categories' && (
        preview === null ? <Spinner size={24} /> : (
          <>
            <p className={styles.note} data-settings-aside="true">
              {t('profile.cloud.import.explain', {
                machine: step.machine.hostname || unknown,
                profile: step.profile.name,
                target: targetProfileName,
              })}
            </p>
            {preview.categories.map(category => {
              const metrics = Object.entries(category.metrics)
                .filter(([, count]) => count > 0)
                .map(([id, count]) => t(pluralKey(`profile.cloud.import.metric.${id}`, language, count), { count }));
              return (
                <SettingToggle
                  key={category.category}
                  label={t(`settings.profiles.sharing.cat.${category.category}.label`)}
                  icon={CATEGORY_ICONS[category.category]}
                  description={metrics.length > 0 ? metrics.join(' · ') : formatSize(category.sizeBytes)}
                  checked={selected.includes(category.category)}
                  onChange={() => toggle(category.category)}
                />
              );
            })}
            <p className={styles.note} data-settings-aside="true">
              {t('profile.cloud.import.overwriteWarning')}
            </p>
            <div className={styles.profileActions}>
              <Button type="button" tone="ghost" size="sm" onClick={() => setStep({ kind: 'profiles', machine: step.machine })}>
                {t('profile.cloud.import.back')}
              </Button>
              <Button
                type="button"
                tone="accent"
                size="sm"
                icon={<Check />}
                loading={busy}
                disabled={selected.length === 0}
                onClick={() => void confirm()}
              >
                {t('profile.cloud.import.confirm')}
              </Button>
            </div>
          </>
        )
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { AlertTriangle, SearchX, Inbox } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { DeviceModal } from '../../common/DeviceModal/DeviceModal';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Spinner } from '../../common/Spinner/Spinner';
import { Button } from '../../common/Button/Button';
import { PRESET_CAP } from '../../common/PresetToolbar/PresetToolbar';
import {
  fetchElgatoProfiles, importElgatoProfile, createDeckPreset,
  type ElgatoProfileSummary, type ElgatoImportReport,
} from '../../../api/streamdeck';
import { dedupePresetName, unmappedReasonKey } from './elgatoImportUtils';
import styles from './ElgatoImportModal.module.scss';

type Status = 'loading' | 'error' | 'notFound' | 'unsupportedVersion' | 'list';

interface ElgatoImportModalProps {
  open: boolean;
  onClose: () => void;
  serial: string;
  /** Existing preset names on this deck, for dedupe + cap gating. */
  existingPresetNames: string[];
  /** Called with the new preset's id once it has been created, so the caller
   *  can refresh its preset list AND load the imported config into the editor
   *  (before the user hits Done). */
  onImported: (presetId: string) => void;
}

/**
 * Import flow for the local Elgato Stream Deck install: fetch profiles ->
 * pick one -> translate + create a Nexus preset from it -> show the mapped/
 * unmapped report. The caller loads the created preset so the editor and the
 * physical deck show the imported layout immediately.
 */
export function ElgatoImportModal({ open, onClose, serial, existingPresetNames, onImported }: ElgatoImportModalProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('loading');
  const [profiles, setProfiles] = useState<ElgatoProfileSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ presetName: string; report: ElgatoImportReport } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('loading');
    setProfiles([]);
    setSelectedId(null);
    setResult(null);
    setImportError(null);
    void fetchElgatoProfiles().then(res => {
      if (cancelled) return;
      if (!res) { setStatus('error'); return; }
      setProfiles(res.profiles);
      setStatus(res.status === 'ok' ? 'list' : res.status);
    });
    return () => { cancelled = true; };
  }, [open]);

  const atCap = existingPresetNames.length >= PRESET_CAP;

  const handleImport = async () => {
    if (!selectedId || atCap) return;
    setImporting(true);
    setImportError(null);
    const importRes = await importElgatoProfile(selectedId);
    if (!importRes) {
      setImporting(false);
      setImportError(t('devices.streamdeck.import.importFailed'));
      return;
    }
    const profile = profiles.find(p => p.id === selectedId);
    const fallbackName = t('lighting.layoutPresets.defaultName', { n: existingPresetNames.length + 1 });
    const name = dedupePresetName(profile?.name ?? '', existingPresetNames, fallbackName);
    const createRes = await createDeckPreset(serial, name, importRes.config);
    setImporting(false);
    if (!createRes) {
      setImportError(t('devices.streamdeck.import.importFailed'));
      return;
    }
    setResult({ presetName: name, report: importRes.report });
    onImported(createRes.preset.id);
  };

  return (
    <DeviceModal open={open} onClose={onClose} title={t('devices.streamdeck.import.title')} medium>
      <div className={styles.body}>
        {status === 'loading' && (
          <div className={styles.loadingRow}>
            <Spinner size={24} />
          </div>
        )}

        {status === 'error' && (
          <EmptyState
            icon={<AlertTriangle size={32} />}
            title={t('devices.streamdeck.import.errorTitle')}
            hint={t('lighting.controls.importNetworkError')}
          />
        )}

        {status === 'notFound' && (
          <EmptyState
            icon={<SearchX size={32} />}
            title={t('devices.streamdeck.import.notFoundTitle')}
            hint={t('devices.streamdeck.import.notFoundBody')}
          />
        )}

        {status === 'unsupportedVersion' && (
          <EmptyState
            icon={<AlertTriangle size={32} />}
            title={t('devices.streamdeck.import.unsupportedTitle')}
            hint={t('devices.streamdeck.import.unsupportedBody')}
          />
        )}

        {status === 'list' && !result && (
          <>
            {profiles.length === 0 ? (
              <EmptyState icon={<Inbox size={32} />} title={t('devices.streamdeck.import.emptyTitle')} />
            ) : (
              <div className={styles.list} role="radiogroup" aria-label={t('devices.streamdeck.import.title')}>
                {profiles.map(profile => (
                  <button
                    key={profile.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedId === profile.id}
                    className={styles.row}
                    data-active={selectedId === profile.id ? 'true' : undefined}
                    onClick={() => setSelectedId(profile.id)}
                  >
                    <span className={styles.rowName}>{profile.name}</span>
                    <span className={styles.rowMeta}>
                      {profile.modelLabel} · {t('devices.streamdeck.import.profileSummary', { pages: profile.pageCount, keys: profile.keyCount })}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {importError && <p className={styles.error}>{importError}</p>}

            {profiles.length > 0 && (
              <div className={styles.footer}>
                {atCap && <span className={styles.capNote}>{t('lighting.layoutPresets.capReached', { max: PRESET_CAP })}</span>}
                <Button type="button" tone="accent" loading={importing} disabled={!selectedId || atCap} onClick={handleImport}>
                  {t('devices.streamdeck.import.import')}
                </Button>
              </div>
            )}
          </>
        )}

        {result && (
          <div className={styles.result}>
            <p className={styles.resultTitle}>{t('devices.streamdeck.import.resultTitle')}</p>
            <p className={styles.resultPresetName}>{t('devices.streamdeck.import.resultPresetName', { name: result.presetName })}</p>
            <p className={styles.resultHint}>{t('devices.streamdeck.import.resultNotActivated')}</p>
            <p className={styles.mappedSummary}>
              {t('devices.streamdeck.import.mappedSummary', { mapped: result.report.mappedKeys, total: result.report.totalKeys })}
            </p>

            {result.report.unmapped.length > 0 && (
              <div className={styles.unmapped}>
                <p className={styles.unmappedHeader}>{t('devices.streamdeck.import.unmappedHeader')}</p>
                <ul className={styles.unmappedList}>
                  {result.report.unmapped.map(item => (
                    <li key={`${item.page}-${item.position}`} className={styles.unmappedItem}>
                      <span className={styles.unmappedPosition}>
                        {t('devices.streamdeck.import.unmappedPosition', { page: item.page, position: item.position })}
                      </span>
                      <span className={styles.unmappedName}>{item.name}</span>
                      <span className={styles.unmappedReason}>{t(unmappedReasonKey(item.reason))}</span>
                      {item.detail && (
                        <span className={styles.unmappedDetail}>
                          {t('devices.streamdeck.import.unmappedDetail', { detail: item.detail })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.footer}>
              <Button type="button" tone="accent" onClick={onClose}>{t('devices.streamdeck.import.done')}</Button>
            </div>
          </div>
        )}
      </div>
    </DeviceModal>
  );
}

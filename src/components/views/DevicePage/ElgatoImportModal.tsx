import { useEffect, useState } from 'react';
import { AlertTriangle, SearchX, Inbox } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { DeviceModal } from '../../common/DeviceModal/DeviceModal';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Spinner } from '../../common/Spinner/Spinner';
import { Button } from '../../common/Button/Button';
import { Badge } from '../../common/Badge/Badge';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import { DECK_PRESET_CAP } from '../../../panel/widgets/deck/DeckPresetToolbar';
import {
  fetchElgatoProfiles, importElgatoProfile,
  type ElgatoProfileSummary, type ElgatoImportReport,
} from '../../../api/streamdeck';
import { createDeckPreset, getDeckTemplates, type DeckTemplate } from '../../../api/deck';
import { dedupePresetName, unmappedReasonKey } from './elgatoImportUtils';
import styles from './ElgatoImportModal.module.scss';

type Status = 'loading' | 'error' | 'notFound' | 'unsupportedVersion' | 'list';

interface ElgatoImportModalProps {
  open: boolean;
  onClose: () => void;
  /** The importing deck's own grid - the created preset is authored at this size. */
  deckCols: number;
  deckRows: number;
  /** Existing preset names (host-wide), for dedupe + cap gating. */
  existingPresetNames: string[];
  /** Templates a preset was already made from; tagged Added but still addable. */
  addedTemplateIds: string[];
  /** Called with the new preset's id once it has been created, so the caller
   *  can refresh its preset list AND activate the imported preset on this
   *  instance (before the user hits Done). */
  onImported: (presetId: string) => void;
}

/**
 * Import preset: the bundled starter presets (one press creates and closes),
 * then the local Elgato Stream Deck install: fetch profiles -> pick one ->
 * translate + create a host-wide Nexus preset from it -> show the
 * mapped/unmapped report. The caller activates the created preset so the
 * editor and the physical deck show the imported layout immediately.
 */
export function ElgatoImportModal({ open, onClose, deckCols, deckRows, existingPresetNames, addedTemplateIds, onImported }: ElgatoImportModalProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('loading');
  const [profiles, setProfiles] = useState<ElgatoProfileSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ presetName: string; report: ElgatoImportReport } | null>(null);
  const [templates, setTemplates] = useState<DeckTemplate[]>([]);
  const [adding, setAdding] = useState(false);
  const [starterError, setStarterError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('loading');
    setProfiles([]);
    setSelectedId(null);
    setResult(null);
    setImportError(null);
    setStarterError(null);
    void getDeckTemplates().then(list => { if (!cancelled) setTemplates(list); });
    void fetchElgatoProfiles().then(res => {
      if (cancelled) return;
      if (!res) { setStatus('error'); return; }
      setProfiles(res.profiles);
      setStatus(res.status === 'ok' ? 'list' : res.status);
    });
    return () => { cancelled = true; };
  }, [open]);

  const atCap = existingPresetNames.length >= DECK_PRESET_CAP;

  // The service de-dupes the name and binds the installed app unless another
  // preset already holds it, so a starter can be added more than once.
  const addStarter = async (tpl: DeckTemplate) => {
    if (adding || importing || atCap) return;
    setAdding(true);
    setStarterError(null);
    const created = await createDeckPreset({ name: tpl.name, cols: tpl.cols, rows: tpl.rows, templateId: tpl.id });
    setAdding(false);
    if (!created) {
      setStarterError(t('panel.settings.deck.presets.createFailed'));
      return;
    }
    onImported(created.id);
    onClose();
  };

  const handleImport = async () => {
    if (!selectedId || atCap || adding) return;
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
    const createRes = await createDeckPreset({ name, cols: deckCols, rows: deckRows, deck: importRes.config });
    setImporting(false);
    if (!createRes) {
      setImportError(t('devices.streamdeck.import.importFailed'));
      return;
    }
    setResult({ presetName: name, report: importRes.report });
    onImported(createRes.id);
  };

  return (
    <DeviceModal open={open} onClose={onClose} title={t('devices.streamdeck.import.title')} medium>
      <div className={styles.body}>
        {!result && atCap && <span className={styles.capNote}>{t('lighting.layoutPresets.capReached', { max: DECK_PRESET_CAP })}</span>}

        {!result && templates.length > 0 && (
          <>
            <SectionHeader>{t('devices.streamdeck.import.startersHeader')}</SectionHeader>
            <div className={styles.list}>
              {templates.map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  className={styles.row}
                  disabled={adding || importing || atCap}
                  onClick={() => void addStarter(tpl)}
                >
                  <span className={styles.rowTitle}>
                    <span className={styles.rowName}>{tpl.name}</span>
                    {addedTemplateIds.includes(tpl.id) && <Badge label={t('devices.streamdeck.import.added')} />}
                  </span>
                </button>
              ))}
            </div>
            {starterError && <p className={styles.error}>{starterError}</p>}
          </>
        )}

        {!result && <SectionHeader>{t('devices.streamdeck.import.elgatoHeader')}</SectionHeader>}

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
                <Button type="button" tone="accent" loading={importing} disabled={!selectedId || atCap || adding} onClick={handleImport}>
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
                    <li key={item.dial != null ? `${item.page}-dial-${item.dial}` : `${item.page}-${item.position}`} className={styles.unmappedItem}>
                      <span className={styles.unmappedPosition}>
                        {item.dial != null
                          ? t('devices.streamdeck.import.unmappedPositionDial', { page: item.page, dial: item.dial })
                          : t('devices.streamdeck.import.unmappedPosition', { page: item.page, position: item.position })}
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

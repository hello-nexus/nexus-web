import { useEffect, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingRow } from '../SettingRow/SettingRow';
import { Button } from '../Button/Button';
import { Spinner } from '../Spinner/Spinner';
import { applyNexus2Import, previewNexus2Import } from '../../../api/migration';
import type { Nexus2ApplyResult, Nexus2PreviewResponse } from '../../../api/migration';
import {
  allApplyResultsClean, applyDetailKey, applyStatusKey, categoryLabelKey, defaultSelectedGroupIds,
  groupDetailParts, groupResultSummaries, selectedWireIds, visibleImportGroups, type ImportGroupId,
} from './nexus2WelcomeUtils';
import styles from './Nexus2ImportSection.module.scss';

type PreviewStatus = 'idle' | 'loading' | 'loaded' | 'error';
type ImportPhase = 'idle' | 'busy' | 'results';

export interface Nexus2ImportSectionProps {
  /** Fetches the preview on every falsy-to-truthy edge, mirroring ScreenTimeDataControl. */
  open: boolean;
  /** Blocks every control while a caller-owned flow is also in flight. */
  disabled?: boolean;
  /** Fires synchronously on every busy-state transition, so a host can gate its own actions. */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Grouped Nexus 2.0 import flow: preview fetch, two grouped checkboxes (Y70
 * panel personalization, Q-Series panel personalization), the replace-layout
 * confirm, apply, and per-group results. Shared by Nexus2WelcomeScreen and
 * the Settings re-entry dialog (Nexus2ImportDialog) - one place owns the
 * markup so both stay in sync.
 */
export function Nexus2ImportSection({ open, disabled, onBusyChange }: Nexus2ImportSectionProps) {
  const { t } = useTranslation();
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [preview, setPreview] = useState<Nexus2PreviewResponse | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<ImportGroupId>>(new Set());
  const [replaceLayout, setReplaceLayout] = useState(false);
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [importResults, setImportResults] = useState<Nexus2ApplyResult[] | null>(null);
  const [importRequestError, setImportRequestError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewStatus('loading');
    setPreview(null);
    setSelectedGroups(new Set());
    setReplaceLayout(false);
    setImportResults(null);
    setImportRequestError(false);
    setImportPhase('idle');
    void previewNexus2Import().then(res => {
      if (cancelled) return;
      if (!res) { setPreviewStatus('error'); return; }
      setPreview(res);
      setSelectedGroups(defaultSelectedGroupIds(res));
      setPreviewStatus('loaded');
    });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const toggleGroup = (id: ImportGroupId) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const locked = importPhase === 'busy' || !!disabled;

  const handleImportSelected = async () => {
    const ids = selectedWireIds(preview, selectedGroups);
    if (locked || ids.length === 0) return;
    setImportPhase('busy');
    onBusyChange?.(true);
    setImportRequestError(false);
    const res = await applyNexus2Import(ids, replaceLayout);
    if (!res) {
      setImportRequestError(true);
      setImportPhase('idle');
      onBusyChange?.(false);
      return;
    }
    setImportResults(res.results);
    setImportPhase('results');
    onBusyChange?.(false);
  };

  const groups = visibleImportGroups(preview);
  const summaries = groupResultSummaries(importResults);
  const needsReplaceConfirm = summaries.some(s => s.issues.some(i => i.status === 'needsConfirm'));
  const importSuccess = importPhase === 'results' && allApplyResultsClean(importResults);
  const selectionEmpty = selectedWireIds(preview, selectedGroups).length === 0;

  return (
    <SettingsSection
      className={styles.section}
      boxClassName={styles.box}
      title={t('nexus2Welcome.import.title')}
      description={<p>{t('nexus2Welcome.import.description')}</p>}
    >
      {previewStatus === 'loading' && (
        <div className={styles.previewLoading} data-settings-aside>
          <Spinner size={20} />
        </div>
      )}

      {previewStatus === 'error' && (
        <p className={styles.error} data-settings-aside>{t('nexus2Welcome.import.error')}</p>
      )}

      {previewStatus === 'loaded' && preview && (
        <>
          {preview.profileName && (
            <p className={styles.profileName} data-settings-aside>
              {t('nexus2Welcome.import.profileName', { name: preview.profileName })}
            </p>
          )}

          {groups.map(group => {
            const label = t(group.labelKey);
            const detail = groupDetailParts(preview, group).map(d => t(d.key, d.params)).join(' · ');
            return (
              <SettingRow key={group.id} label={label} description={detail} descriptionBelow>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  aria-label={label}
                  checked={selectedGroups.has(group.id)}
                  disabled={locked}
                  onChange={() => toggleGroup(group.id)}
                />
              </SettingRow>
            );
          })}

          {needsReplaceConfirm && (
            <SettingRow label={t('nexus2Welcome.import.confirmReplaceLayout')} descriptionBelow>
              <input
                type="checkbox"
                className={styles.checkbox}
                aria-label={t('nexus2Welcome.import.confirmReplaceLayout')}
                checked={replaceLayout}
                disabled={locked}
                onChange={e => setReplaceLayout(e.target.checked)}
              />
            </SettingRow>
          )}

          {summaries.length > 0 && (
            <ul className={styles.resultList} data-settings-aside>
              {summaries.map(s => (
                <li key={s.groupId} className={styles.resultRow}>
                  <span className={styles.resultCategory}>{t(s.labelKey)}</span>
                  <span className={styles[`resultStatus-${s.status}`]}>{t(applyStatusKey(s.status))}</span>
                  {s.issues.map(issue => (
                    <span key={issue.id} className={styles.resultDetail}>
                      {issue.detail
                        ? t('nexus2Welcome.import.result.subDetail', {
                          category: t(categoryLabelKey(issue.id), { id: issue.id }),
                          detail: t(applyDetailKey(issue.detail), { detail: issue.detail }),
                        })
                        : t(categoryLabelKey(issue.id), { id: issue.id })}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}

          {importSuccess && (
            <p className={styles.importSuccess} data-settings-aside>{t('nexus2Welcome.import.successSummary')}</p>
          )}

          <div className={styles.importFooter} data-settings-aside>
            <Button
              tone="neutral"
              size="sm"
              loading={importPhase === 'busy'}
              loadingHidesLabel
              disabled={selectionEmpty || locked}
              onClick={handleImportSelected}
            >
              {t('nexus2Welcome.import.action')}
            </Button>
            {importRequestError && <span className={styles.error}>{t('nexus2Welcome.import.error')}</span>}
          </div>
        </>
      )}
    </SettingsSection>
  );
}

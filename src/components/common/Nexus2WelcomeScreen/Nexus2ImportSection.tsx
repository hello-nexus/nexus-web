import { useEffect, useImperativeHandle, useState, type RefObject } from 'react';
import { Fan, LayoutGrid } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingToggle } from '../SettingRow/SettingRow';
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

/** Apply outcome for a host-driven import. */
export type Nexus2ImportOutcome = 'clean' | 'failed';

/** Lets a host drive the apply from its own button. */
export interface Nexus2ImportHandle {
  runImport: () => Promise<Nexus2ImportOutcome>;
}

export interface Nexus2ImportSectionProps {
  /** Fetches the preview on every falsy-to-truthy edge, mirroring ScreenTimeDataControl. */
  open: boolean;
  /** Blocks every control while a caller-owned flow is also in flight. */
  disabled?: boolean;
  /** Fires synchronously on every busy-state transition, so a host can gate its own actions. */
  onBusyChange?: (busy: boolean) => void;
  /** False hides the built-in apply button for hosts that drive the import from their own (the welcome screen's Continue). */
  showAction?: boolean;
  /** Reports whether any group is selected, so a host can label its own action. */
  onSelectionChange?: (hasSelection: boolean) => void;
  /** Receives the apply runner for hosts with showAction=false. */
  handleRef?: RefObject<Nexus2ImportHandle | null>;
  /** True in a dialog, where the section gets the whole surface rather than
   *  the narrower onboarding column. */
  wide?: boolean;
}

/**
 * Grouped Nexus 2 import flow: preview fetch, two grouped switches (Y70
 * panel personalization, Q-Series panel personalization), apply, and per-group
 * results. Hosted by Nexus2WelcomeScreen and by ImportCenter, which is what
 * the Settings entry opens - one place owns the markup so both stay in sync.
 */
export function Nexus2ImportSection({
  open, disabled, onBusyChange, showAction = true, onSelectionChange, handleRef, wide,
}: Nexus2ImportSectionProps) {
  const { t } = useTranslation();
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [preview, setPreview] = useState<Nexus2PreviewResponse | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<ImportGroupId>>(new Set());
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [importResults, setImportResults] = useState<Nexus2ApplyResult[] | null>(null);
  const [importRequestError, setImportRequestError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewStatus('loading');
    setPreview(null);
    setSelectedGroups(new Set());
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

  const locked = importPhase === 'busy' || !!disabled;

  // Guards on its own in-flight phase only, never the host's `disabled`: a
  // host driving this from its own button sets that flag in the same tick,
  // and consulting it here would make the call a silent no-op.
  const runImport = async (): Promise<Nexus2ImportOutcome> => {
    const ids = selectedWireIds(preview, selectedGroups);
    if (importPhase === 'busy' || ids.length === 0) return 'failed';
    setImportPhase('busy');
    onBusyChange?.(true);
    setImportRequestError(false);
    let res: Awaited<ReturnType<typeof applyNexus2Import>> = null;
    try {
      // Always replaces: the section's description says so up front, which
      // is what the service's confirm flag exists to establish.
      res = await applyNexus2Import(ids, true);
    } catch {
      res = null;
    }
    if (!res) {
      setImportRequestError(true);
      setImportPhase('idle');
      onBusyChange?.(false);
      return 'failed';
    }
    setImportResults(res.results);
    setImportPhase('results');
    onBusyChange?.(false);
    return allApplyResultsClean(res.results) ? 'clean' : 'failed';
  };

  const selectionEmpty = selectedWireIds(preview, selectedGroups).length === 0;

  // Both hooks sit above the closed-early-return so hook order stays stable
  // across open toggles (the component stays mounted, per Dashboard gating).
  useEffect(() => {
    onSelectionChange?.(!selectionEmpty);
  }, [selectionEmpty, onSelectionChange]);

  // No dep list: the handle must always close over the latest selection state.
  useImperativeHandle(handleRef, () => ({ runImport }));

  if (!open) return null;

  const toggleGroup = (id: ImportGroupId) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const groups = visibleImportGroups(preview);
  const summaries = groupResultSummaries(importResults);
  const importSuccess = importPhase === 'results' && allApplyResultsClean(importResults);

  return (
    <SettingsSection
      className={wide ? styles.sectionWide : styles.section}
      boxClassName={styles.box}
      // In the two-column import surface the column already carries a title,
      // so the section repeating one just says it twice.
      title={wide ? undefined : t('nexus2Welcome.import.title')}
      ariaLabel={t('nexus2Welcome.import.title')}
      description={wide ? undefined : <p>{t('nexus2Welcome.import.description')}</p>}
    >
      {wide && (
        <p className={styles.replaceNotice} data-settings-aside>{t('nexus2Welcome.import.description')}</p>
      )}
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
            const Icon = group.id === 'q60Panel' ? Fan : LayoutGrid;
            return (
              <SettingToggle
                key={group.id}
                label={label}
                description={detail}
                icon={<Icon />}
                iconLeading
                checked={selectedGroups.has(group.id)}
                disabled={locked}
                onChange={() => toggleGroup(group.id)}
              />
            );
          })}

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

          {(showAction || importRequestError) && (
            <div className={styles.importFooter} data-settings-aside>
              {showAction && (
                <Button
                  tone="neutral"
                  size="sm"
                  loading={importPhase === 'busy'}
                  loadingHidesLabel
                  disabled={selectionEmpty || locked}
                  onClick={runImport}
                >
                  {t('nexus2Welcome.import.action')}
                </Button>
              )}
              {importRequestError && <span className={styles.error}>{t('nexus2Welcome.import.error')}</span>}
            </div>
          )}
        </>
      )}
    </SettingsSection>
  );
}

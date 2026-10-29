import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react';
import { Fan, LayoutDashboard, LineChart } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingToggle } from '../SettingRow/SettingRow';
import { Button } from '../Button/Button';
import { Spinner } from '../Spinner/Spinner';
import { applyNexus2Import, previewNexus2Import } from '../../../api/migration';
import type { Nexus2ApplyResult, Nexus2PreviewResponse } from '../../../api/migration';
import {
  allApplyResultsClean, applyDetailKey, applyStatusKey, issueCategoryLabelKey, defaultSelectedGroupIds,
  groupDetailParts, groupResultSummaries, hasKeptSetupSkip, groupHasAvailable, selectedWireIds, unavailableGroupNote,
  presetLabelKey, fanGroupLabelKey, visibleImportGroups, importHeaderKeys, formatList, fillTemplate, type CategoryDetail, type ImportGroupId,
} from './nexus2WelcomeUtils';
import styles from './Nexus2ImportSection.module.scss';

type PreviewStatus = 'idle' | 'loading' | 'loaded' | 'error';
type ImportPhase = 'idle' | 'busy' | 'results';

/** Apply outcome for a host-driven import. */
export type Nexus2ImportOutcome = 'clean' | 'failed';

/** Lets a host drive the apply from its own button. */
export interface Nexus2ImportHandle {
  runImport: () => Promise<Nexus2ImportOutcome>;
  /**
   * True when a run now would include fan curves the user has not been shown:
   * the list has not entered the viewport for the current preview, or the
   * host saw it unseen when the press happened. The host then reveals the
   * list instead of importing.
   */
  fanCurvesNeedReview: (unseenAtPress?: boolean) => boolean;
  /** Whether this preview's fan curve list has entered the viewport. */
  fanListSeen: () => boolean;
  /** Scrolls the fan curve group into view. */
  revealFanCurves: () => void;
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
  /** Reports whether any group is selected, so a host can label its own action. Silent until the preview has settled: before that the answer is not known. */
  onSelectionChange?: (hasSelection: boolean) => void;
  /** Receives the apply runner for hosts with showAction=false. */
  handleRef?: RefObject<Nexus2ImportHandle | null>;
  /** False while the host hides this panel; the fan curve list only counts as shown while visible. */
  visible?: boolean;
  /** True in a dialog, where the section gets the whole surface rather than
   *  the narrower onboarding column. */
  wide?: boolean;
  /** Groups to leave out, for a pillar the user switched off: they are neither shown nor selected. */
  excludeGroups?: readonly ImportGroupId[];
}

/**
 * Grouped Nexus 2 import flow: preview fetch, three grouped switches (Y70
 * panel personalization, Q-Series panel personalization, fan curves), apply, and per-group
 * results. Hosted by Nexus2WelcomeScreen and by ImportCenter, which is what
 * the Settings entry opens - one place owns the markup so both stay in sync.
 */
export function Nexus2ImportSection({
  open, disabled, onBusyChange, showAction = true, onSelectionChange, handleRef, wide, visible = true, excludeGroups,
}: Nexus2ImportSectionProps) {
  const { t, language } = useTranslation();
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [preview, setPreview] = useState<Nexus2PreviewResponse | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<Set<ImportGroupId>>(new Set());
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [importResults, setImportResults] = useState<Nexus2ApplyResult[] | null>(null);
  // The preview the apply ran against: result labels follow it, not a refreshed preview.
  const [appliedPreview, setAppliedPreview] = useState<Nexus2PreviewResponse | null>(null);
  const [importRequestError, setImportRequestError] = useState(false);
  // The preview object whose fan curve list entered the viewport. Comparing
  // identity ties "seen" to one load: a new preview is never seen already.
  const seenPreviewRef = useRef<Nexus2PreviewResponse | null>(null);
  const fanGroupRef = useRef<HTMLDivElement | null>(null);
  // Bumped on every (re)open and on unmount so a late refetch response is dropped.
  const loadEpochRef = useRef(0);
  // Read when a preview lands; a new exclusion list alone must not refetch it.
  const excludeRef = useRef(excludeGroups);
  excludeRef.current = excludeGroups;
  useEffect(() => () => { loadEpochRef.current += 1; }, []);

  useEffect(() => {
    if (!open) return;
    loadEpochRef.current += 1;
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
      setSelectedGroups(new Set([...defaultSelectedGroupIds(res)].filter(g => !excludeRef.current?.includes(g))));
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
    setAppliedPreview(preview);
    setImportResults(res.results);
    setImportPhase('results');
    // A skipped fan group means the service state moved since the preview;
    // refetch so the group shows its real state instead of staying armed.
    if (res.results.some(r => r.id === 'fanCurves' && r.status === 'skipped')) {
      const epoch = loadEpochRef.current;
      void previewNexus2Import().then(fresh => {
        // A newer open or an unmount owns the state now.
        if (!fresh || epoch !== loadEpochRef.current) return;
        setPreview(fresh);
        // Only the fan entry follows the fresh preview; every other toggle
        // stays as the user left it, including ones changed since the apply.
        setSelectedGroups(prev => {
          if (!prev.has('fanCurves') || defaultSelectedGroupIds(fresh).has('fanCurves')) return prev;
          const next = new Set(prev);
          next.delete('fanCurves');
          return next;
        });
      });
    }
    onBusyChange?.(false);
    return allApplyResultsClean(res.results) ? 'clean' : 'failed';
  };

  const selectionEmpty = selectedWireIds(preview, selectedGroups).length === 0;

  // The importable fan group (curve list or preset line) counts as seen only once it has
  // entered the viewport while the host shows this panel. Without
  // IntersectionObserver (a test DOM) rendering is the best signal there is.
  const fanListRenders = previewStatus === 'loaded'
    && !excludeGroups?.includes('fanCurves')
    && (preview?.categories.some(c => c.id === 'fanCurves' && c.available) ?? false);
  useEffect(() => {
    const el = fanGroupRef.current;
    if (!open || !visible || !fanListRenders || !el || !preview) return;
    if (typeof IntersectionObserver === 'undefined') {
      seenPreviewRef.current = preview;
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        seenPreviewRef.current = preview;
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, visible, fanListRenders, preview]);

  // Both hooks sit above the closed-early-return so hook order stays stable
  // across open toggles (the component stays mounted, per Dashboard gating).
  const previewSettled = previewStatus === 'loaded' || previewStatus === 'error';
  useEffect(() => {
    if (previewSettled) onSelectionChange?.(!selectionEmpty);
  }, [previewSettled, selectionEmpty, onSelectionChange]);

  const fanListSeen = () => preview !== null && seenPreviewRef.current === preview;
  const fanCurvesNeedReview = (unseenAtPress?: boolean) =>
    selectedWireIds(preview, selectedGroups).includes('fanCurves') && (!!unseenAtPress || !fanListSeen());
  const revealFanCurves = () => fanGroupRef.current?.scrollIntoView?.({ block: 'nearest' });
  // No dep list: the handle must always close over the latest selection state.
  useImperativeHandle(handleRef, () => ({ runImport, fanCurvesNeedReview, fanListSeen, revealFanCurves }));

  if (!open) return null;

  const toggleGroup = (id: ImportGroupId) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const translatedParams = (d: CategoryDetail) => {
    const params = { ...d.params };
    for (const [name, key] of Object.entries(d.paramKeys ?? {})) params[name] = t(key);
    return params;
  };
  const groups = visibleImportGroups(preview).filter(g => !excludeGroups?.includes(g.id));
  const { titleKey, descriptionKey } = importHeaderKeys(preview);
  const summaries = groupResultSummaries(importResults, appliedPreview);
  const importSuccess = importPhase === 'results' && allApplyResultsClean(importResults) && !hasKeptSetupSkip(importResults);

  return (
    <SettingsSection
      className={wide ? styles.sectionWide : styles.section}
      boxClassName={styles.box}
      // In the two-column import surface the column already carries a title,
      // so the section repeating one just says it twice.
      title={wide ? undefined : t(titleKey)}
      ariaLabel={t(titleKey)}
      description={<p>{t(descriptionKey)}</p>}
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
            const label = t(fanGroupLabelKey(preview, group));
            // A span list: SettingToggle renders the description inside a span.
            const note = unavailableGroupNote(preview, group);
            const detail = note ? <span>{t(note.key, Object.keys(note.params).length > 0 ? translatedParams(note) : undefined)}</span> : (
              <span className={styles.detailBullets} role="list">
                {groupDetailParts(preview, group).map((d, i) => {
                  const params = translatedParams(d);
                  return (
                    <span key={`${d.key}-${i}`} className={styles.detailBullet} role="listitem">
                      {d.user?.list
                        ? fillTemplate(t('nexus2Welcome.import.category.fanCurves.curve'), {
                          name: d.user.name, fans: formatList(d.user.list, language),
                        })
                        : d.user
                          ? fillTemplate(t('nexus2Welcome.import.category.fanCurves.reasonLine'), {
                            name: d.user.name, reason: t(d.key),
                          })
                          : t(d.plural ? pluralKey(d.key, language, Number(d.params.count)) : d.key, params)}
                    </span>
                  );
                })}
              </span>
            );
            const Icon = group.id === 'q60Panel' ? Fan : group.id === 'fanCurves' ? LineChart : LayoutDashboard;
            return (
              <div key={group.id} ref={group.id === 'fanCurves' ? fanGroupRef : undefined}>
                <SettingToggle
                  label={label}
                  description={detail}
                  icon={<Icon />}
                  iconLeading
                  checked={selectedGroups.has(group.id)}
                  disabled={locked || !groupHasAvailable(preview, group)}
                  onChange={() => toggleGroup(group.id)}
                />
              </div>
            );
          })}

          {summaries.length > 0 && (
            <ul className={styles.resultList} data-settings-aside>
              {summaries.map(s => (
                <li key={s.groupId} className={styles.resultRow}>
                  <span className={styles.resultCategory}>{t(s.labelKey)}</span>
                  <span className={styles[`resultStatus-${s.status}`]}>
                    {s.groupId === 'fanCurves' && s.status === 'applied' && presetLabelKey(s.preset)
                      ? t('nexus2Welcome.import.result.presetApplied', { preset: t(presetLabelKey(s.preset)!) })
                      : s.groupId === 'fanCurves' && s.status === 'applied' && s.count !== undefined
                      ? t(pluralKey('nexus2Welcome.import.result.fanCurvesApplied', language, s.count), { count: s.count })
                      : t(applyStatusKey(s.status))}
                  </span>
                  {s.issues.map(issue => (
                    <span key={issue.id} className={styles.resultDetail}>
                      {issue.detail
                        ? t('nexus2Welcome.import.result.subDetail', {
                          category: t(issueCategoryLabelKey(issue, appliedPreview), { id: issue.id }),
                          detail: t(applyDetailKey(issue.detail), { detail: issue.detail }),
                        })
                        : t(issueCategoryLabelKey(issue, appliedPreview), { id: issue.id })}
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
                  onClick={() => runImport()}
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

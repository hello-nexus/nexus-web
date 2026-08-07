import { useEffect, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingRow } from '../SettingRow/SettingRow';
import { Button } from '../Button/Button';
import { Spinner } from '../Spinner/Spinner';
import { NexusWordmark } from '../../icons/NexusBrand';
import {
  applyNexus2Import, closeNexus2App, disableNexus2Autostart, dismissNexus2Welcome, previewNexus2Import,
} from '../../../api/migration';
import type { Nexus2ApplyResult, Nexus2PreviewResponse, Nexus2StatusResponse } from '../../../api/migration';
import {
  allApplyResultsClean, applyDetailKey, applyStatusKey, availableCategories, categoryDetail, categoryLabelKey,
  defaultSelectedCategoryIds, droppedTypeKey, droppedY70Types, initialActionChecks, resultFor, type ActionChecks,
} from './nexus2WelcomeUtils';
import styles from './Nexus2WelcomeScreen.module.scss';

export interface Nexus2WelcomeScreenProps {
  open: boolean;
  payload: Nexus2StatusResponse | null;
  onComplete: () => void;
}

type ActionResult = 'idle' | 'success' | 'error';
type ApplyPhase = 'idle' | 'applying' | 'failed';
type PreviewStatus = 'idle' | 'loading' | 'loaded' | 'error';
type ImportPhase = 'idle' | 'busy' | 'results';

/**
 * One-time returning-user screen for HYTE Nexus 2 owners, shown after the
 * onboarding WelcomeScreen completes. Non-dismissable: Continue is the only
 * way through. Text-only HYTE Nexus 2 references - no HYTE logo/branding.
 * Self-contained: open/completion flow entirely through props, no shared
 * state with any sibling post-onboarding screen.
 */
export function Nexus2WelcomeScreen({ open, payload, onComplete }: Nexus2WelcomeScreenProps) {
  const { t } = useTranslation();

  const [actions, setActions] = useState<ActionChecks>({ closeApp: false, disableAutostart: false });
  const [closeResult, setCloseResult] = useState<ActionResult>('idle');
  const [autostartResult, setAutostartResult] = useState<ActionResult>('idle');
  const [applyPhase, setApplyPhase] = useState<ApplyPhase>('idle');
  const [dismissing, setDismissing] = useState(false);

  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [preview, setPreview] = useState<Nexus2PreviewResponse | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [replaceLayout, setReplaceLayout] = useState(false);
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [importResults, setImportResults] = useState<Nexus2ApplyResult[] | null>(null);
  const [importRequestError, setImportRequestError] = useState(false);

  // Resets on every open (the component stays mounted across open toggles, per
  // Dashboard's always-rendered gating) and fires the read-only preview fetch
  // once, when importAvailable.
  useEffect(() => {
    if (!open) return;
    setActions(initialActionChecks(payload));
    setApplyPhase('idle');
    setCloseResult('idle');
    setAutostartResult('idle');
    setDismissing(false);

    if (!payload?.importAvailable) return;
    let cancelled = false;
    setPreviewStatus('loading');
    setPreview(null);
    setSelectedCategories(new Set());
    setReplaceLayout(false);
    setImportResults(null);
    setImportRequestError(false);
    setImportPhase('idle');
    void previewNexus2Import().then(res => {
      if (cancelled) return;
      if (!res) { setPreviewStatus('error'); return; }
      setPreview(res);
      setSelectedCategories(defaultSelectedCategoryIds(res));
      setPreviewStatus('loaded');
    });
    return () => { cancelled = true; };
  }, [open, payload]);

  if (!open) return null;

  const showCloseRow = !!payload?.running;
  const showAutostartRow = !!payload?.autostartTaskPresent;
  const hasActionsSection = showCloseRow || showAutostartRow;
  const actionsLocked = applyPhase !== 'idle';

  // Applies the checked actions in a fixed order (close before autostart) on
  // Continue. On any failure the screen stays open with inline error lines
  // and Continue relabels to "continue anyway" - a second click always
  // dismisses, it never re-attempts the failed action. Blocked while an
  // import is in flight so the screen never closes out from under a pending
  // import result.
  const handleContinue = async () => {
    if (applyPhase === 'applying' || dismissing || importPhase === 'busy') return;

    if (applyPhase === 'failed') {
      setDismissing(true);
      try { await dismissNexus2Welcome(); } catch { /* best-effort */ } finally { setDismissing(false); }
      onComplete();
      return;
    }

    setApplyPhase('applying');
    let hadFailure = false;

    if (actions.closeApp) {
      const res = await closeNexus2App();
      const ok = !!res && !res.error;
      setCloseResult(ok ? 'success' : 'error');
      if (!ok) hadFailure = true;
    }
    if (actions.disableAutostart) {
      const res = await disableNexus2Autostart();
      const ok = !!res && !res.error;
      setAutostartResult(ok ? 'success' : 'error');
      if (!ok) hadFailure = true;
    }

    if (hadFailure) {
      setApplyPhase('failed');
      return;
    }

    setDismissing(true);
    try { await dismissNexus2Welcome(); } catch { /* best-effort */ } finally { setDismissing(false); }
    onComplete();
  };

  const closeAppDescription = closeResult === 'success'
    ? t('nexus2Welcome.closeApp.success')
    : closeResult === 'error'
      ? <span className={styles.actionError}>{t('nexus2Welcome.closeApp.error')}</span>
      : t('nexus2Welcome.closeApp.description');

  const autostartDescription = autostartResult === 'success'
    ? t('nexus2Welcome.autostart.success')
    : autostartResult === 'error'
      ? <span className={styles.actionError}>{t('nexus2Welcome.autostart.error')}</span>
      : t('nexus2Welcome.autostart.description');

  const toggleCategory = (id: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Blocked while Continue's close/autostart apply is in flight, so the two
  // async flows never run concurrently against the service.
  const handleImportSelected = async () => {
    if (importPhase === 'busy' || selectedCategories.size === 0 || applyPhase !== 'idle') return;
    setImportPhase('busy');
    setImportRequestError(false);
    const res = await applyNexus2Import(Array.from(selectedCategories), replaceLayout);
    if (!res) {
      setImportRequestError(true);
      setImportPhase('idle');
      return;
    }
    setImportResults(res.results);
    setImportPhase('results');
  };

  const needsReplaceConfirm = resultFor(importResults, 'y70Layout')?.status === 'needsConfirm';
  const importSuccess = importPhase === 'results' && allApplyResultsClean(importResults);
  const importLocked = importPhase === 'busy' || applyPhase !== 'idle';
  const droppedTypes = droppedY70Types(preview);
  const droppedTypeNames = droppedTypes.length > 0
    ? droppedTypes.map(type => t(droppedTypeKey(type), { type })).join(', ')
    : null;

  return (
    <Overlay
      open={open}
      onClose={() => { /* non-dismissable: only Continue proceeds */ }}
      noEscDismiss
      noBackdropDismiss
      onEnter={handleContinue}
      ariaLabel={t('nexus2Welcome.title')}
      className={styles.surface}
      backdropClassName={styles.backdrop}
    >
      <div className={styles.hero}>
        <NexusWordmark height={32} />
        <h1 className={styles.title}>{t('nexus2Welcome.title')}</h1>
        {payload?.version && (
          <p className={styles.versionDetected}>{t('nexus2Welcome.versionDetected', { version: payload.version })}</p>
        )}
        <p className={styles.body}>{t('nexus2Welcome.body')}</p>
        <p className={styles.body}>{t('nexus2Welcome.coexistence')}</p>
      </div>

      {hasActionsSection && (
        <SettingsSection className={styles.section} boxClassName={styles.actionsBox}>
          {showCloseRow && (
            <SettingRow
              label={t('nexus2Welcome.closeApp.rowLabel')}
              description={closeAppDescription}
              descriptionBelow
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                aria-label={t('nexus2Welcome.closeApp.rowLabel')}
                checked={actions.closeApp}
                disabled={actionsLocked}
                onChange={e => setActions(a => ({ ...a, closeApp: e.target.checked }))}
              />
            </SettingRow>
          )}
          {showAutostartRow && (
            <SettingRow
              label={t('nexus2Welcome.autostart.rowLabel')}
              description={autostartDescription}
              descriptionBelow
            >
              <input
                type="checkbox"
                className={styles.checkbox}
                aria-label={t('nexus2Welcome.autostart.rowLabel')}
                checked={actions.disableAutostart}
                disabled={actionsLocked}
                onChange={e => setActions(a => ({ ...a, disableAutostart: e.target.checked }))}
              />
            </SettingRow>
          )}
        </SettingsSection>
      )}

      {payload?.importAvailable && (
        <SettingsSection
          className={styles.section}
          boxClassName={styles.actionsBox}
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

              {availableCategories(preview).map(cat => {
                const detail = categoryDetail(cat);
                const label = t(categoryLabelKey(cat.id), { id: cat.id });
                return (
                  <SettingRow
                    key={cat.id}
                    label={label}
                    description={t(detail.key, detail.params)}
                    descriptionBelow
                  >
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      aria-label={label}
                      checked={selectedCategories.has(cat.id)}
                      disabled={importLocked}
                      onChange={() => toggleCategory(cat.id)}
                    />
                  </SettingRow>
                );
              })}

              {droppedTypeNames && (
                <p className={styles.droppedHint} data-settings-aside>
                  {t('nexus2Welcome.import.category.y70Layout.droppedHint', { types: droppedTypeNames })}
                </p>
              )}

              {needsReplaceConfirm && (
                <SettingRow
                  label={t('nexus2Welcome.import.confirmReplaceLayout')}
                  descriptionBelow
                >
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    aria-label={t('nexus2Welcome.import.confirmReplaceLayout')}
                    checked={replaceLayout}
                    disabled={importLocked}
                    onChange={e => setReplaceLayout(e.target.checked)}
                  />
                </SettingRow>
              )}

              {importResults && (
                <ul className={styles.resultList} data-settings-aside>
                  {importResults.map(r => (
                    <li key={r.id} className={styles.resultRow}>
                      <span className={styles.resultCategory}>{t(categoryLabelKey(r.id), { id: r.id })}</span>
                      <span className={styles[`resultStatus-${r.status}`]}>{t(applyStatusKey(r.status))}</span>
                      {r.detail && (
                        <span className={styles.resultDetail}>{t(applyDetailKey(r.detail), { detail: r.detail })}</span>
                      )}
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
                  disabled={selectedCategories.size === 0 || importLocked}
                  onClick={handleImportSelected}
                >
                  {t('nexus2Welcome.import.action')}
                </Button>
                {importRequestError && <span className={styles.error}>{t('nexus2Welcome.import.error')}</span>}
              </div>
            </>
          )}
        </SettingsSection>
      )}

      <Button
        tone="accent"
        size="lg"
        onClick={handleContinue}
        loading={applyPhase === 'applying' || dismissing}
        loadingHidesLabel
        disabled={importPhase === 'busy'}
        className={styles.continueButton}
      >
        {applyPhase === 'failed' ? t('nexus2Welcome.continueAnyway') : t('nexus2Welcome.continue')}
      </Button>
    </Overlay>
  );
}

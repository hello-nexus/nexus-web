import { useEffect, useImperativeHandle, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { Fan, Gauge, SlidersHorizontal, Tag, Waves } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingToggle } from '../SettingRow/SettingRow';
import { Button } from '../Button/Button';
import { Select } from '../Select/Select';
import { Spinner } from '../Spinner/Spinner';
import {
  applyFanControlImport, previewFanControlImport,
  type FanControlApplyResponse, type FanControlCategory, type FanControlConfigFile,
  type FanControlMatch, type FanControlPreviewResponse,
} from '../../../api/fancontrol';
import styles from './FanControlImportSection.module.scss';

type PreviewStatus = 'idle' | 'loading' | 'loaded' | 'error';
type ImportPhase = 'idle' | 'busy' | 'results';

export type FanControlImportOutcome = 'clean' | 'failed';

/** Lets a host (the onboarding screen) drive the apply from its own button. */
export interface FanControlImportHandle {
  runImport: () => Promise<FanControlImportOutcome>;
}

const CATEGORIES: {
  id: FanControlCategory;
  labelKey: string;
  descriptionKey: string;
  icon: ReactNode;
  count: (p: FanControlPreviewResponse) => number;
}[] = [
  {
    id: 'curves',
    labelKey: 'fanControlImport.category.curves',
    descriptionKey: 'fanControlImport.category.curvesDetail',
    icon: <Waves />,
    count: p => p.curveCount,
  },
  {
    id: 'calibration',
    labelKey: 'fanControlImport.category.calibration',
    descriptionKey: 'fanControlImport.category.calibrationDetail',
    icon: <Gauge />,
    count: p => p.calibrationCount,
  },
  {
    id: 'names',
    labelKey: 'fanControlImport.category.names',
    descriptionKey: 'fanControlImport.category.namesDetail',
    icon: <Tag />,
    count: p => p.nameCount,
  },
  {
    id: 'offsets',
    labelKey: 'fanControlImport.category.offsets',
    descriptionKey: 'fanControlImport.category.offsetsDetail',
    icon: <SlidersHorizontal />,
    count: p => p.offsetCount,
  },
  {
    id: 'manual',
    labelKey: 'fanControlImport.category.manual',
    descriptionKey: 'fanControlImport.category.manualDetail',
    icon: <Fan />,
    count: p => p.manualCount,
  },
];

const MATCH_LABEL_KEYS: Record<FanControlMatch, string> = {
  exact: 'fanControlImport.match.exact',
  normalized: 'fanControlImport.match.normalized',
  name: 'fanControlImport.match.name',
  position: 'fanControlImport.match.position',
  none: 'fanControlImport.match.none',
};

export interface FanControlImportSectionProps {
  /** Fetches the preview on every falsy-to-truthy edge. */
  open: boolean;
  configs: FanControlConfigFile[];
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** False hides the built-in apply button for a host that drives the import from its own. */
  showAction?: boolean;
  onSelectionChange?: (hasSelection: boolean) => void;
  handleRef?: RefObject<FanControlImportHandle | null>;
  /** Fires after a successful apply, so a host can refetch cooling state. */
  onImported?: () => void;
  /** Fills the host's width instead of the narrower onboarding column. */
  wide?: boolean;
}

/**
 * The FanControl import flow: pick one of its saved configurations, preview
 * what maps onto this PC, choose which categories to take, apply. Shared by the
 * onboarding screen and the cooling page's dialog so the markup lives once.
 */
export function FanControlImportSection({
  open, configs, disabled, onBusyChange, showAction = true, onSelectionChange, handleRef, onImported, wide,
}: FanControlImportSectionProps) {
  const { t, language } = useTranslation();
  const defaultPath = configs.find(c => c.isDefault)?.path ?? configs[0]?.path ?? '';
  const [configPath, setConfigPath] = useState(defaultPath);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [preview, setPreview] = useState<FanControlPreviewResponse | null>(null);
  const [selected, setSelected] = useState<Set<FanControlCategory>>(new Set());
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [result, setResult] = useState<FanControlApplyResponse | null>(null);
  const [requestError, setRequestError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfigPath(defaultPath);
    setImportPhase('idle');
    setResult(null);
    setRequestError(false);
    // Keyed on the path, not the configs array: a re-render with a new array
    // identity must not throw away the config the user picked.
  }, [open, defaultPath]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreviewStatus('loading');
    setPreview(null);
    setSelected(new Set());
    void previewFanControlImport(configPath).then(res => {
      if (cancelled) return;
      if (!res || res.error || !res.available) { setPreviewStatus('error'); return; }
      setPreview(res);
      setSelected(new Set(CATEGORIES.filter(c => c.count(res) > 0).map(c => c.id)));
      setPreviewStatus('loaded');
    });
    return () => { cancelled = true; };
  }, [open, configPath]);

  const availableCategories = useMemo(
    () => (preview ? CATEGORIES.filter(c => c.count(preview) > 0) : []),
    [preview],
  );
  // The fan rows follow the switches: a fan is listed when the selection
  // actually takes something from it, and an unmatched one is listed whenever
  // any per-fan category is on, since that is what will not come over.
  const shownFans = useMemo(() => {
    if (!preview) return [];
    const perFan = (['calibration', 'names', 'offsets', 'manual'] as const).some(c => selected.has(c));
    if (!perFan) return [];
    return preview.fans.filter(fan => {
      if (!fan.channelId) return true;
      if (selected.has('calibration') && fan.hasCalibration) return true;
      if (selected.has('names') && fan.nickName) return true;
      if (selected.has('offsets') && fan.offset !== 0) return true;
      if (selected.has('manual') && fan.manualDuty != null) return true;
      return false;
    });
  }, [preview, selected]);

  const selectionEmpty = selected.size === 0;
  const locked = importPhase === 'busy' || !!disabled;

  // Silent until the preview has settled: before that the answer is not known.
  const previewSettled = previewStatus === 'loaded' || previewStatus === 'error';
  useEffect(() => {
    if (previewSettled) onSelectionChange?.(!selectionEmpty);
  }, [previewSettled, selectionEmpty, onSelectionChange]);

  // Guards on its own phase only: a host driving this from its own button sets
  // `disabled` in the same tick, and consulting it here would no-op the call.
  const runImport = async (): Promise<FanControlImportOutcome> => {
    if (importPhase === 'busy' || selectionEmpty || !preview) return 'failed';
    setImportPhase('busy');
    onBusyChange?.(true);
    setRequestError(false);
    let res: FanControlApplyResponse | null = null;
    try {
      res = await applyFanControlImport(configPath, [...selected]);
    } catch {
      res = null;
    }
    onBusyChange?.(false);
    if (!res || res.error) {
      setRequestError(true);
      setImportPhase('idle');
      return 'failed';
    }
    setResult(res);
    setImportPhase('results');
    onImported?.();
    return 'clean';
  };

  useImperativeHandle(handleRef, () => ({ runImport }));

  if (!open) return null;

  const toggle = (id: FanControlCategory) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <SettingsSection
      className={wide ? styles.sectionWide : styles.section}
      boxClassName={styles.box}
      // In a dialog the host already carries this as its title; repeating it
      // inside the surface just says it twice.
      title={wide ? undefined : t('fanControlImport.title')}
      ariaLabel={t('fanControlImport.title')}
      description={wide ? undefined : <p>{t('fanControlImport.description')}</p>}
    >
      {configs.length > 1 && (
        <label className={styles.configRow} data-settings-aside>
          <span className={styles.configLabel}>{t('fanControlImport.config')}</span>
          <Select value={configPath} onChange={setConfigPath} ariaLabel={t('fanControlImport.config')}
            disabled={locked}>
            {configs.map(c => (<option key={c.path} value={c.path}>{c.name}</option>))}
          </Select>
        </label>
      )}

      {previewStatus === 'loading' && (
        <div className={styles.loading} data-settings-aside><Spinner size={20} /></div>
      )}

      {previewStatus === 'error' && (
        <p className={styles.error} data-settings-aside>{t('fanControlImport.error')}</p>
      )}

      {previewStatus === 'loaded' && preview && (
        <>
          {availableCategories.length === 0 && (
            <p className={styles.empty} data-settings-aside>{t('fanControlImport.nothingToImport')}</p>
          )}

          {availableCategories.map(c => (
            <SettingToggle
              key={c.id}
              label={t(c.labelKey)}
              description={t(pluralKey(c.descriptionKey, language, c.count(preview)), { count: c.count(preview) })}
              icon={c.icon}
              iconLeading
              checked={selected.has(c.id)}
              disabled={locked}
              onChange={() => toggle(c.id)}
            />
          ))}

          {selected.has('curves') && preview.curves.length > 0 && (
            <div className={styles.detail} data-settings-aside>
              <span className={styles.detailHeader}>{t('fanControlImport.curvesHeader')}</span>
              <ul className={styles.detailList}>
                {preview.curves.map(curve => (
                  <li key={curve.name} className={curve.supported ? styles.row : styles.rowSkipped}>
                    <span className={styles.rowName}>{curve.name}</span>
                    <span className={styles.rowMeta}>
                      {curve.supported
                        ? t(`fanControlImport.curveType.${curve.targetType.toLowerCase()}`)
                        : (curve.reasonCode
                          ? t(`fanControlImport.reason.${curve.reasonCode}`, { detail: curve.reasonDetail ?? '' })
                          : t('fanControlImport.curveSkipped'))}
                    </span>
                    {curve.supported && curve.fanNames.length > 0 && (
                      <span className={styles.rowFans}>{curve.fanNames.join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {shownFans.length > 0 && (
            <div className={styles.detail} data-settings-aside>
              <span className={styles.detailHeader}>{t('fanControlImport.fansHeader')}</span>
              <ul className={styles.detailList}>
                {shownFans.map(fan => (
                  <li key={fan.identifier} className={fan.channelId ? styles.row : styles.rowSkipped}>
                    <span className={styles.rowName}>{fan.sourceName}</span>
                    <span className={styles.rowMeta}>
                      {fan.channelId
                        ? `${fan.channelName} (${t(MATCH_LABEL_KEYS[fan.match])})`
                        : t(MATCH_LABEL_KEYS.none)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importPhase === 'results' && result && (
            <p className={styles.success} data-settings-aside>
              {t('fanControlImport.successSummary', {
                curves: result.curvesImported,
                calibrated: result.calibrationsImported,
                names: result.namesImported,
                offsets: result.offsetsImported,
                fixed: result.manualImported,
              })}
            </p>
          )}

          {(showAction || requestError) && (
            <div className={styles.footer} data-settings-aside>
              {showAction && (
                <Button
                  tone="neutral"
                  size="sm"
                  loading={importPhase === 'busy'}
                  loadingHidesLabel
                  disabled={selectionEmpty || locked}
                  onClick={runImport}
                >
                  {t('fanControlImport.action')}
                </Button>
              )}
              {requestError && <span className={styles.error}>{t('fanControlImport.error')}</span>}
            </div>
          )}
        </>
      )}
    </SettingsSection>
  );
}

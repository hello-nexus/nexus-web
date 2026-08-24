import { useEffect, useImperativeHandle, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { Fan, Gauge, SlidersHorizontal, Tag, Waves } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
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

const CATEGORY_ICON_SIZE = 28;

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
    icon: <Waves size={CATEGORY_ICON_SIZE} />,
    count: p => p.curveCount,
  },
  {
    id: 'calibration',
    labelKey: 'fanControlImport.category.calibration',
    descriptionKey: 'fanControlImport.category.calibrationDetail',
    icon: <Gauge size={CATEGORY_ICON_SIZE} />,
    count: p => p.calibrationCount,
  },
  {
    id: 'names',
    labelKey: 'fanControlImport.category.names',
    descriptionKey: 'fanControlImport.category.namesDetail',
    icon: <Tag size={CATEGORY_ICON_SIZE} />,
    count: p => p.nameCount,
  },
  {
    id: 'offsets',
    labelKey: 'fanControlImport.category.offsets',
    descriptionKey: 'fanControlImport.category.offsetsDetail',
    icon: <SlidersHorizontal size={CATEGORY_ICON_SIZE} />,
    count: p => p.offsetCount,
  },
  {
    id: 'manual',
    labelKey: 'fanControlImport.category.manual',
    descriptionKey: 'fanControlImport.category.manualDetail',
    icon: <Fan size={CATEGORY_ICON_SIZE} />,
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
}

/**
 * The FanControl import flow: pick one of its saved configurations, preview
 * what maps onto this PC, choose which categories to take, apply. Shared by the
 * onboarding screen and the cooling page's dialog so the markup lives once.
 */
export function FanControlImportSection({
  open, configs, disabled, onBusyChange, showAction = true, onSelectionChange, handleRef, onImported,
}: FanControlImportSectionProps) {
  const { t } = useTranslation();
  const [configPath, setConfigPath] = useState('');
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [preview, setPreview] = useState<FanControlPreviewResponse | null>(null);
  const [selected, setSelected] = useState<Set<FanControlCategory>>(new Set());
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [result, setResult] = useState<FanControlApplyResponse | null>(null);
  const [requestError, setRequestError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfigPath(configs.find(c => c.isDefault)?.path ?? configs[0]?.path ?? '');
    setImportPhase('idle');
    setResult(null);
    setRequestError(false);
  }, [open, configs]);

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
      // Everything with something to import starts on: the user came here to
      // move their setup over, not to assemble it a checkbox at a time.
      setSelected(new Set(CATEGORIES.filter(c => c.count(res) > 0).map(c => c.id)));
      setPreviewStatus('loaded');
    });
    return () => { cancelled = true; };
  }, [open, configPath]);

  const availableCategories = useMemo(
    () => (preview ? CATEGORIES.filter(c => c.count(preview) > 0) : []),
    [preview],
  );
  const selectionEmpty = selected.size === 0;
  const locked = importPhase === 'busy' || !!disabled;

  useEffect(() => {
    onSelectionChange?.(!selectionEmpty);
  }, [selectionEmpty, onSelectionChange]);

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
      className={styles.section}
      boxClassName={styles.box}
      title={t('fanControlImport.title')}
      description={<p>{t('fanControlImport.description')}</p>}
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
              description={t(c.descriptionKey, { count: c.count(preview) })}
              icon={c.icon}
              iconLeading
              checked={selected.has(c.id)}
              disabled={locked}
              onChange={() => toggle(c.id)}
            />
          ))}

          {preview.curves.length > 0 && (
            <div className={styles.detail} data-settings-aside>
              <span className={styles.detailHeader}>{t('fanControlImport.curvesHeader')}</span>
              <ul className={styles.detailList}>
                {preview.curves.map(curve => (
                  <li key={curve.name} className={curve.supported ? styles.row : styles.rowSkipped}>
                    <span className={styles.rowName}>{curve.name}</span>
                    <span className={styles.rowMeta}>
                      {curve.supported
                        ? t(`fanControlImport.curveType.${curve.targetType.toLowerCase()}`)
                        : (curve.reason ?? t('fanControlImport.curveSkipped'))}
                    </span>
                    {curve.supported && curve.fanNames.length > 0 && (
                      <span className={styles.rowFans}>{curve.fanNames.join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.fans.length > 0 && (
            <div className={styles.detail} data-settings-aside>
              <span className={styles.detailHeader}>{t('fanControlImport.fansHeader')}</span>
              <ul className={styles.detailList}>
                {preview.fans.map(fan => (
                  <li key={fan.identifier} className={fan.channelId ? styles.row : styles.rowSkipped}>
                    <span className={styles.rowName}>{fan.sourceName}</span>
                    <span className={styles.rowMeta}>
                      {fan.channelId ? fan.channelName : t('fanControlImport.match.none')}
                    </span>
                    <span className={styles.rowBadge}>{t(MATCH_LABEL_KEYS[fan.match])}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.skipped.length > 0 && (
            <ul className={styles.skippedList} data-settings-aside>
              {preview.skipped.map(note => (<li key={note} className={styles.skippedNote}>{note}</li>))}
            </ul>
          )}

          {importPhase === 'results' && result && (
            <p className={styles.success} data-settings-aside>
              {t('fanControlImport.successSummary', {
                curves: result.curvesImported,
                fans: result.calibrationsImported,
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

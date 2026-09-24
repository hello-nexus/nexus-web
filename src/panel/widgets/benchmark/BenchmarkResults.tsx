import { Cpu, Monitor, MemoryStick, HardDrive, AppWindow, Wrench, Trophy, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { BenchmarkResult, BenchmarkSubScore } from '../../../types/benchmark';
import { Card } from '../../../components/common/Card/Card';
import { DomainGlyph } from '../../../components/common/DomainGlyph/DomainGlyph';
import { SystemSpecsPanel } from '../../../components/common/SystemSpecsPanel/SystemSpecsPanel';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { Button } from '../../../components/common/Button/Button';
import { requestOpenBuild } from '../../../components/views/BuildPage/buildNav';
import { DEV_TOOLS } from '../../../lib/devTools';
import styles from './BenchmarkPage.module.scss';

interface Props {
  result: BenchmarkResult;
  submission: { percentile: number; rank: number; total: number } | null;
  submitting: boolean;
  submissionId?: string | null;
  /** Set only while "Help improve Nexus" is off and this result is not uploaded yet. */
  onUpload?: () => void;
}

const SUBSYSTEM_ICONS: Record<string, LucideIcon> = {
  cpu: Cpu,
  gpu: Monitor,
  ram: MemoryStick,
  storage: HardDrive,
};

function SubsystemCard({ s, model }: { s: BenchmarkSubScore; model: string }) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const Icon = SUBSYSTEM_ICONS[s.key];
  const spreadPct = t('benchmark.result.spread', { pct: localizeNumbers((Math.abs(s.spread ?? 0) * 100).toFixed(1), numberFormat) });
  return (
    <Card
      className={styles.subCard}
      title={
        <span className={styles.subCardTitle}>
          {Icon && <Icon size={18} />}
          {t(`benchmark.phase.${s.key}`)}
        </span>
      }
      subtitle={
        <span className={styles.subCardScore}>
          {t('benchmark.result.pts', { n: String(Math.round(s.score)) })}
          {s.spread != null && (
            s.trials && s.trials.length > 0
              ? (
                <HoverTooltip title={t('benchmark.result.trials')} body={s.trials.map(v => localizeNumbers(v.toFixed(1), numberFormat)).join(' \u00b7 ') + ' ' + s.rawUnit}>
                  <span className={styles.subSpread}>{spreadPct}</span>
                </HoverTooltip>
              )
              : <span className={styles.subSpread}>{spreadPct}</span>
          )}
        </span>
      }
    >
      {Icon && <DomainGlyph icon={Icon} />}
      <div className={styles.subRawPrimary}>
        {localizeNumbers(s.rawValue.toFixed(1), numberFormat)}{' '}
        <span className={styles.subUnit}>{s.rawUnit}</span>
      </div>
      {model && <div className={styles.subModel} title={model}>{model}</div>}
    </Card>
  );
}

export function BenchmarkResults({ result, submission, submitting, submissionId, onUpload }: Props) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const hw = result.hardware;
  const subs: BenchmarkSubScore[] = [result.cpu, result.gpu, result.ram, result.storage];
  const models: Record<string, string> = {
    cpu: hw.cpuModel,
    gpu: (hw.gpuModels ?? []).join(' + '),
    ram: hw.ramModel,
    storage: hw.storageModel,
  };

  return (
    <div className={styles.resultsPanel}>
      <div className={styles.compositeCard}>
        <div className={styles.compositeHero}>
          <div className={styles.compositeLabel}>{t('benchmark.result.composite')}</div>
          <div className={styles.compositeScore}>{Math.round(result.composite)}</div>
          {submitting && !submission && (
            <div className={styles.compositeResultLine}>
              <span className={styles.percentilePending}>{t('benchmark.result.submitting')}</span>
            </div>
          )}
          {submission && (
            <div className={styles.compositeResultLine}>
              <span className={styles.percentile}>
                {t('benchmark.result.percentile', {
                  pct: localizeNumbers(submission.percentile.toFixed(1), numberFormat),
                  total: String(submission.total),
                })}
              </span>
              <span className={styles.rankLine}>
                {t('benchmark.result.rank', {
                  rank: String(submission.rank),
                  total: String(submission.total),
                })}
              </span>
            </div>
          )}
          {onUpload && !submission && !submitting && (
            <div className={styles.compositeResultLine}>
              <span className={styles.percentilePending}>{t('benchmark.result.uploadPrompt', { setting: t('settings.telemetry.label') })}</span>
              <Button tone="ghost" icon={<Trophy size={14} />} onClick={onUpload}>
                {t('benchmark.result.uploadCta')}
              </Button>
            </div>
          )}
        </div>
        {DEV_TOOLS && submissionId && (
          <Button
            tone="accent"
            icon={<Wrench size={14} />}
            className={styles.exploreCta}
            onClick={() => requestOpenBuild(`/upgrade?bench=${encodeURIComponent(submissionId)}`)}
          >
            {t('benchmark.result.exploreUpgrades')}
          </Button>
        )}
        {result.scoringVersion && (
          <div className={styles.scoringVersion}>
            {t('benchmark.leaderboard.version')}{': '}
            <span>{result.scoringVersion}</span>
          </div>
        )}
      </div>

      <div className={styles.subGrid}>
        {subs.map(s => <SubsystemCard key={s.key} s={s} model={models[s.key] ?? ''} />)}
        <SystemSpecsPanel variant="tiles" rows={[{ icon: <AppWindow size={18} />, label: t('benchmark.leaderboard.os'), value: hw.os }]} />
      </div>
    </div>
  );
}

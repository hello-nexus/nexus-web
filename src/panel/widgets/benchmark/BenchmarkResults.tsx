import { Cpu, Monitor, MemoryStick, HardDrive, AppWindow, Wrench } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { BenchmarkResult, BenchmarkSubScore } from '../../../types/benchmark';
import { Card } from '../../../components/common/Card/Card';
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
}

const SUBSYSTEM_ICONS: Record<string, React.ReactNode> = {
  cpu: <Cpu size={16} />,
  gpu: <Monitor size={16} />,
  ram: <MemoryStick size={16} />,
  storage: <HardDrive size={16} />,
};

function SubsystemCard({ s, model }: { s: BenchmarkSubScore; model: string }) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const spreadPct = t('benchmark.result.spread', { pct: localizeNumbers((Math.abs(s.spread ?? 0) * 100).toFixed(1), numberFormat) });
  return (
    <Card
      title={
        <span className={styles.subCardTitle}>
          {SUBSYSTEM_ICONS[s.key]}
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
      <div className={styles.subRawPrimary}>
        {localizeNumbers(s.rawValue.toFixed(1), numberFormat)}{' '}
        <span className={styles.subUnit}>{s.rawUnit}</span>
      </div>
      {model && <div className={styles.subModel} title={model}>{model}</div>}
    </Card>
  );
}

export function BenchmarkResults({ result, submission, submitting, submissionId }: Props) {
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
        <div className={styles.compositeLabel}>{t('benchmark.result.composite')}</div>
        <div className={styles.compositeScore}>{Math.round(result.composite)}</div>
        {submitting && !submission && (
          <div className={styles.percentilePending}>{t('benchmark.result.submitting')}</div>
        )}
        {submission && (
          <div className={styles.percentile}>
            {t('benchmark.result.percentile', {
              pct: localizeNumbers(submission.percentile.toFixed(1), numberFormat),
              total: String(submission.total),
            })}
          </div>
        )}
        {submission && (
          <div className={styles.rankLine}>
            {t('benchmark.result.rank', {
              rank: String(submission.rank),
              total: String(submission.total),
            })}
          </div>
        )}
        {result.scoringVersion && (
          <div className={styles.scoringVersion}>
            {t('benchmark.leaderboard.version')}{': '}
            <span>{result.scoringVersion}</span>
          </div>
        )}
        {DEV_TOOLS && submissionId && (
          <Button
            size="sm"
            tone="neutral"
            icon={<Wrench size={14} />}
            onClick={() => requestOpenBuild(`/upgrade?bench=${encodeURIComponent(submissionId)}`)}
          >
            {t('benchmark.result.exploreUpgrades')}
          </Button>
        )}
      </div>

      <div className={styles.subGrid}>
        {subs.map(s => <SubsystemCard key={s.key} s={s} model={models[s.key] ?? ''} />)}
        <SystemSpecsPanel variant="tiles" rows={[{ icon: <AppWindow size={16} />, label: t('benchmark.leaderboard.os'), value: hw.os }]} />
      </div>
    </div>
  );
}

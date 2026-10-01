import type { ReactNode } from 'react';
import { Cpu, Monitor, MemoryStick, HardDrive, AppWindow, Trophy, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { localizeNumbers } from '../../../lib/units';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { BenchmarkResult, BenchmarkSubScore } from '../../../types/benchmark';
import { Card } from '../../../components/common/Card/Card';
import { DomainGlyph } from '../../../components/common/DomainGlyph/DomainGlyph';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { Button } from '../../../components/common/Button/Button';
import { BenchmarkChip } from './BenchmarkChip';
import styles from './BenchmarkPage.module.scss';

interface Props {
  result: BenchmarkResult;
  submission: { percentile: number; rank: number; total: number } | null;
  submitting: boolean;
  /** Set only while "Help improve Nexus" is off and this result is not uploaded yet. */
  onUpload?: () => void;
  /** Controls docked top-right in the score header. */
  actions?: ReactNode;
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

export function BenchmarkResults({ result, submission, submitting, onUpload, actions }: Props) {
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

  const showUpload = !!onUpload && !submission && !submitting;
  const hasAside = (submitting && !submission) || !!submission || showUpload;

  return (
    <div className={styles.resultsPanel}>
      <div className={styles.compositeCard}>
        {actions && <div className={styles.compositeActions}>{actions}</div>}
        <div className={styles.compositeReadout}>
          <BenchmarkChip still contained />
          <div className={styles.compositeLabel}>{t('benchmark.result.composite')}</div>
          <div className={styles.compositeScore}>{Math.round(result.composite)}</div>
        </div>
        {hasAside && (
          <div className={styles.compositeAside}>
            {submitting && !submission && (
              <span className={styles.percentilePending}>{t('benchmark.result.submitting')}</span>
            )}
            {submission && (
              <>
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
              </>
            )}
            {showUpload && (
              <>
                <span className={styles.percentilePending}>{t('benchmark.result.uploadPrompt', { setting: t('settings.telemetry.label') })}</span>
                <Button tone="ghost" icon={<Trophy size={14} />} onClick={onUpload}>
                  {t('benchmark.result.uploadCta')}
                </Button>
              </>
            )}
          </div>
        )}
        {hw.os && (
          <div className={styles.compositeOs}>
            <AppWindow size={14} aria-hidden />
            <span>{hw.os}</span>
          </div>
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
      </div>
    </div>
  );
}

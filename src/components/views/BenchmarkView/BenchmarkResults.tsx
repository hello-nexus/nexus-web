import { Cpu, Monitor, MemoryStick, HardDrive } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { BenchmarkResult, BenchmarkSubScore } from '../../../types/benchmark';
import { Button } from '../../common/Button/Button';
import { Card } from '../../common/Card/Card';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { SectionHeader } from '../../common/SectionHeader/SectionHeader';
import styles from './BenchmarkView.module.scss';

interface Props {
  result: BenchmarkResult;
  submission: { percentile: number; rank: number; total: number } | null;
  submitting: boolean;
  submissionId?: string | null;
  onViewLeaderboard?: () => void;
}

const SUBSYSTEM_ICONS: Record<string, React.ReactNode> = {
  cpu: <Cpu size={16} />,
  gpu: <Monitor size={16} />,
  ram: <MemoryStick size={16} />,
  storage: <HardDrive size={16} />,
};

function SubsystemCard({ s }: { s: BenchmarkSubScore }) {
  const { t } = useTranslation();
  return (
    <Card
      title={
        <span className={styles.subCardTitle}>
          {SUBSYSTEM_ICONS[s.key]}
          {t(`benchmark.phase.${s.key}`)}
        </span>
      }
      subtitle={
        <span className={styles.subCardScore}>{t('benchmark.result.pts', { n: String(Math.round(s.score)) })}</span>
      }
    >
      <div className={styles.subRawPrimary}>
        {s.rawValue.toFixed(1)}{' '}
        <span className={styles.subUnit}>{s.rawUnit}</span>
      </div>
      {s.detail && <div className={styles.subDetail}>{s.detail}</div>}
    </Card>
  );
}

export function BenchmarkResults({ result, submission, submitting, onViewLeaderboard }: Props) {
  const { t } = useTranslation();
  const subs: BenchmarkSubScore[] = [result.cpu, result.gpu, result.ram, result.storage];

  const toolEntries = result.tools ? Object.entries(result.tools) : [];
  const gpuModels = result.hardware.gpuModels ?? [];

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
              pct: submission.percentile.toFixed(1),
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
        {onViewLeaderboard && (
          <Button tone="ghost" onClick={onViewLeaderboard}>
            {t('benchmark.result.viewLeaderboard')}
          </Button>
        )}
      </div>

      <div className={styles.subGrid}>
        {subs.map(s => <SubsystemCard key={s.key} s={s} />)}
      </div>

      <div className={styles.metaSection}>
        <SectionHeader>{t('benchmark.result.hardware')}</SectionHeader>
        <InfoList>
          <InfoRow label="CPU" value={result.hardware.cpuModel || '-'} />
          {gpuModels.map((g, i) => (
            <InfoRow key={i} label="GPU" value={g} />
          ))}
          <InfoRow label="RAM" value={result.hardware.ramModel || '-'} />
          {/* eslint-disable-next-line i18next/no-literal-string -- Storage is a hardware category proper noun */}
          <InfoRow label="Storage" value={result.hardware.storageModel || '-'} />
          <InfoRow label={t('benchmark.leaderboard.os')} value={result.hardware.os || '-'} />
          <InfoRow label={t('builder.col.cores')} value={String(result.hardware.logicalCores)} />
        </InfoList>
      </div>

      {toolEntries.length > 0 && (
        <div className={styles.metaSection}>
          <SectionHeader>{t('benchmark.leaderboard.tools')}</SectionHeader>
          <InfoList>
            {toolEntries.map(([name, version]) => (
              <InfoRow key={name} label={name} value={version} />
            ))}
          </InfoList>
        </div>
      )}
    </div>
  );
}

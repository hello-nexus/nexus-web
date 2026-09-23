import type { ReactNode } from 'react';
import { Play, RotateCcw, X } from 'lucide-react';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { useBenchmark } from '../../../hooks/useBenchmark';
import { useBenchmarkHistory } from '../../../hooks/useBenchmarkHistory';
import { Button } from '../../../components/common/Button/Button';
import { BenchmarkProgress } from './BenchmarkProgress';
import { BenchmarkResults } from './BenchmarkResults';
import { LeaderboardView } from './LeaderboardView';
import { OFFICIAL_BUILD } from '../../../lib/officialBuild';
import type { WidgetProps } from '../types';
import { useTranslation } from '../../../lib/i18n';
import styles from './BenchmarkTouch.module.scss';

export function BenchmarkTouch({ immersiveGrid }: WidgetProps) {
  const { t } = useTranslation();
  const { status, progress, result, error, start, cancel, reset } = useBenchmark(true);
  const { latest } = useBenchmarkHistory();

  const statusCell: ReactNode = (() => {
    if (status === 'running' && progress) {
      return (
        <div className={styles.cell}>
          <BenchmarkProgress progress={progress} />
          <Button tone="ghost" icon={<X size={14} />} onClick={cancel}>
            {t('benchmark.cancel')}
          </Button>
        </div>
      );
    }

    if (status === 'starting') {
      return (
        <div className={styles.cellCompact}>
          <span className={styles.starting}>{t('benchmark.starting')}</span>
        </div>
      );
    }

    if (status === 'complete' && result) {
      return (
        <div className={styles.cellScroll}>
          <BenchmarkResults result={result} submission={null} submitting={false} />
          <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
            {t('benchmark.rerun')}
          </Button>
        </div>
      );
    }

    if (status === 'failed') {
      return (
        <div className={styles.cellCompact}>
          <p className={styles.failedText}>
            {t('benchmark.failed')}: {error ?? t('benchmark.unknownError')}
          </p>
          <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
            {t('benchmark.rerun')}
          </Button>
        </div>
      );
    }

    if (status === 'cancelled') {
      return (
        <div className={styles.cellCompact}>
          <p className={styles.cancelledText}>{t('benchmark.cancelled')}</p>
          <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
            {t('benchmark.rerun')}
          </Button>
        </div>
      );
    }

    return (
      <div className={styles.cellStart}>
        {latest && (
          <div className={styles.idleComposite}>
            {t('benchmark.result.composite')}: <strong className={styles.idleCompositeValue}>{Math.round(latest.composite)}</strong>
          </div>
        )}
        <Button tone="accent" icon={<Play size={16} />} onClick={() => start()}>
          {t('benchmark.start')}
        </Button>
      </div>
    );
  })();

  const cells: ReactNode[] = OFFICIAL_BUILD
    ? [statusCell, <LeaderboardView key="leaderboard" />]
    : [statusCell];

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

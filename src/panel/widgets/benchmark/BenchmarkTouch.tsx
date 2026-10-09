import { useCallback, useState, type ReactNode } from 'react';
import { Play, RotateCcw, X } from 'lucide-react';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { useBenchmark } from '../../../hooks/useBenchmark';
import { useBenchmarkHistory } from '../../../hooks/useBenchmarkHistory';
import { Button } from '../../../components/common/Button/Button';
import { Notice } from '../../../components/common/Notice/Notice';
import { BenchmarkProgress } from './BenchmarkProgress';
import { BenchmarkResults } from './BenchmarkResults';
import { LeaderboardView } from './LeaderboardView';
import { OFFICIAL_BUILD } from '../../../lib/officialBuild';
import type { WidgetProps } from '../types';
import { useTranslation } from '../../../lib/i18n';

export function BenchmarkTouch({ immersiveGrid }: WidgetProps) {
  const { t } = useTranslation();
  const { status, progress, result, error, start, cancel, reset } = useBenchmark(true);
  const { latest } = useBenchmarkHistory();
  const [revealedRunId, setRevealedRunId] = useState<string | null>(null);
  const revealing = status === 'complete' && !!progress && progress.runId !== revealedRunId;
  const progressRunId = progress?.runId ?? null;
  const handleRevealed = useCallback(() => setRevealedRunId(progressRunId), [progressRunId]);

  const statusCell: ReactNode = (() => {
    if ((status === 'running' || revealing) && progress) {
      return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
          <BenchmarkProgress key={progress.runId} progress={progress} result={result} compact onRevealed={handleRevealed} />
          {!revealing && (
            <Button tone="ghost" icon={<X size={14} />} onClick={cancel}>
              {t('benchmark.cancel')}
            </Button>
          )}
        </div>
      );
    }

    if (status === 'starting') {
      return (
        <div style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: 'var(--type-small)' }}>
          {t('benchmark.starting')}
        </div>
      );
    }

    if (status === 'complete' && result) {
      return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflowY: 'auto' }}>
          <BenchmarkResults result={result} submission={null} submitting={false} />
          <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
            {t('benchmark.rerun')}
          </Button>
        </div>
      );
    }

    if (status === 'failed') {
      return (
        <div style={{ padding: '1rem' }}>
          <Notice
            tone="critical"
            role="alert"
            actions={(
              <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
                {t('benchmark.rerun')}
              </Button>
            )}
          >
            {t('benchmark.failed')}: {error ?? t('benchmark.unknownError')}
          </Notice>
        </div>
      );
    }

    if (status === 'cancelled') {
      return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 'var(--type-small)' }}>{t('benchmark.cancelled')}</p>
          <Button tone="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
            {t('benchmark.rerun')}
          </Button>
        </div>
      );
    }

    return (
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-start', height: '100%' }}>
        {latest && (
          <div style={{ fontSize: 'var(--type-small)', color: 'var(--text-dim)' }}>
            {t('benchmark.result.composite')}: <strong style={{ color: 'var(--accent-glow)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(latest.composite)}</strong>
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

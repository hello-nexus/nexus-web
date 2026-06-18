import type { ReactNode } from 'react';
import { Play, RotateCcw, Square } from 'lucide-react';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { useBenchmark } from '../../../hooks/useBenchmark';
import { useBenchmarkHistory } from '../../../hooks/useBenchmarkHistory';
import { Button } from '../../../components/common/Button/Button';
import { BenchmarkProgress } from './BenchmarkProgress';
import { BenchmarkResults } from './BenchmarkResults';
import { LeaderboardView } from './LeaderboardView';
import type { WidgetProps } from '../types';
import { useTranslation } from '../../../lib/i18n';

export function BenchmarkTouch({ immersiveGrid }: WidgetProps) {
  const { t } = useTranslation();
  const { status, progress, result, error, start, cancel, reset } = useBenchmark(true);
  const { latest } = useBenchmarkHistory();

  const statusCell: ReactNode = (() => {
    if (status === 'running' && progress) {
      return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
          <BenchmarkProgress progress={progress} />
          <Button tone="ghost" icon={<Square size={14} />} onClick={cancel}>
            {t('benchmark.cancel')}
          </Button>
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
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ color: 'var(--bad)', fontSize: 'var(--type-small)' }}>
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
            {t('benchmark.result.composite')}: <strong style={{ color: 'var(--accent-glow)', fontFamily: 'var(--font-mono)' }}>{Math.round(latest.composite)}</strong>
          </div>
        )}
        <Button tone="accent" icon={<Play size={16} />} onClick={() => start()}>
          {t('benchmark.start')}
        </Button>
      </div>
    );
  })();

  const cells: ReactNode[] = [statusCell, <LeaderboardView key="leaderboard" />];

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

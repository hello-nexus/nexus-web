import { lazy } from 'react';
import { Gauge } from 'lucide-react';
import type { AppManifest } from '../types';
import { BenchmarkWidget } from './BenchmarkWidget';
import { BenchmarkTouch } from './BenchmarkTouch';

const BenchmarkPage = lazy(() => import('./BenchmarkPage').then(m => ({ default: m.BenchmarkPage })));

export const benchmarkApp: AppManifest = {
  meta: {
    type: 'benchmark',
    i18nKey: 'panel.widget.benchmark',
    icon: Gauge,
    sizes: ['2x2', '4x2'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: true, landscape: true },
    touch: true,
    hasConfig: false,
  },
  Widget: BenchmarkWidget,
  Page: BenchmarkPage,
  Touch: BenchmarkTouch,
};

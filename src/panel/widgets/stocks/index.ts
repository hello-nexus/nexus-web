import { TrendingUp } from 'lucide-react';
import type { AppManifest } from '../types';
import { StocksWidget } from './StocksWidget';
import { StocksPreview } from './StocksPreview';
import { StocksSettings } from './StocksSettings';
import { DEFAULT_SYMBOLS } from './stocksUtils';

export const stocksApp: AppManifest = {
  meta: {
    type: 'stocks',
    i18nKey: 'panel.widget.stocks',
    icon: TrendingUp,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: true,
    touch: false,
    defaultConfig: () => ({ mode: 'list', period: '1D', symbols: DEFAULT_SYMBOLS }),
  },
  Widget: StocksWidget,
  Preview: StocksPreview,
  Settings: StocksSettings,
};

import { Worm, Play } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { PanelWidgetShell } from '../common/PanelWidgetChrome';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { useIsLandscape } from '../../device/panelPhone';
import { RotatePrompt } from '../games-shared/RotatePrompt';
import { getBestScoreAcross } from '../games-shared/gameBestScore';
import type { WidgetProps } from '../types';
import { snakePreviewBest } from './snakePreviewData';
import styles from './SnakeWidget.module.scss';

const SNAKE_GAME_TYPES = ['snake-easy', 'snake-medium', 'snake-hard'] as const;

export function SnakeWidget({ widget, surface }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const isLandscape = useIsLandscape(surface ?? 'desktop');
  const best = preview ? snakePreviewBest : getBestScoreAcross(SNAKE_GAME_TYPES);

  if (isLandscape) {
    return (
      <PanelWidgetShell size={widget.size} className={styles.widget}>
        <RotatePrompt compact message={t('panel.widget.snake.rotatePrompt')} />
      </PanelWidgetShell>
    );
  }

  return (
    <PanelWidgetShell size={widget.size} className={styles.widget}>
      <div className={styles.main}>
        <Worm className={styles.icon} aria-hidden />
        <div className={styles.title}>{t('panel.widget.snake')}</div>
        {best > 0 && (
          <div className={styles.best}>{t('panel.widget.snake.best', { score: best })}</div>
        )}
        <div className={styles.play}>
          <Play aria-hidden fill="currentColor" />
          {t('panel.widget.snake.play')}
        </div>
      </div>
    </PanelWidgetShell>
  );
}

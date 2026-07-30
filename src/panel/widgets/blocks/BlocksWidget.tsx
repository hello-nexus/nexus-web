import { Blocks as BlocksIcon, Play } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { PanelWidgetShell } from '../common/PanelWidgetChrome';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { useIsLandscape } from '../../device/panelPhone';
import { RotatePrompt } from '../games-shared/RotatePrompt';
import { getBestScore } from '../games-shared/gameBestScore';
import type { WidgetProps } from '../types';
import { blocksPreviewBest } from './blocksPreviewData';
import styles from './BlocksWidget.module.scss';

export function BlocksWidget({ widget, surface }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const isLandscape = useIsLandscape(surface ?? 'desktop');
  const best = preview ? blocksPreviewBest : getBestScore('block');

  if (isLandscape) {
    return (
      <PanelWidgetShell size={widget.size} className={styles.widget}>
        <RotatePrompt compact message={t('panel.widget.blocks.rotatePrompt')} />
      </PanelWidgetShell>
    );
  }

  return (
    <PanelWidgetShell size={widget.size} className={styles.widget}>
      <div className={styles.main}>
        <BlocksIcon className={styles.icon} aria-hidden />
        <div className={styles.title}>{t('panel.widget.blocks')}</div>
        {best > 0 && (
          <div className={styles.best}>{t('panel.widget.blocks.best', { score: best })}</div>
        )}
        <div className={styles.play}>
          <Play aria-hidden />
          {t('panel.widget.blocks.play')}
        </div>
      </div>
    </PanelWidgetShell>
  );
}

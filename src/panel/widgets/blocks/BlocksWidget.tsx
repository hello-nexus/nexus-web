import { Blocks as BlocksIcon, Play } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Button } from '../../../components/common/Button/Button';
import { PanelWidgetShell } from '../common/PanelWidgetChrome';
import { useIsLandscape } from '../../device/panelPhone';
import { RotatePrompt } from '../games-shared/RotatePrompt';
import type { WidgetProps } from '../types';
import styles from './BlocksWidget.module.scss';

export function BlocksWidget({ widget, surface }: WidgetProps) {
  const { t } = useTranslation();
  const isLandscape = useIsLandscape(surface ?? 'desktop');

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
        {/* Decorative: the tile itself opens the game, and usePanelTouchMode
            suppresses that tap on any <button> descendant it hit-tests. */}
        <Button
          size="sm"
          className={styles.play}
          tabIndex={-1}
          aria-hidden
          icon={<Play size={14} fill="currentColor" aria-hidden />}
        >
          {t('panel.widget.blocks.play')}
        </Button>
      </div>
    </PanelWidgetShell>
  );
}

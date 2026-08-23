import { PenLine } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { PanelWidgetShell } from '../common/PanelWidgetChrome';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { useWhiteboardBoard } from './useWhiteboardBoard';
import { WhiteboardSurface } from './WhiteboardSurface';
import { BACKGROUND_CSS } from './whiteboardRender';
import { WHITEBOARD_PREVIEW_STROKES } from './whiteboardPreviewData';
import { DEFAULT_VIEW } from './whiteboardTypes';
import type { WidgetProps } from '../types';
import styles from './WhiteboardWidget.module.scss';

// Breathing room around the fitted drawing so ink never touches the tile edge.
const TILE_FIT_PADDING = 8;

/**
 * Grid tile: a live, read-only thumbnail of the board fitted to the cell.
 * Drawing happens in the fullscreen view - a tile is too small to hold a
 * toolbar, and the panel's own drag / long-press gestures own touches here.
 */
export function WhiteboardWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const { board } = useWhiteboardBoard(preview ? '' : widget.id, true);

  const strokes = preview ? WHITEBOARD_PREVIEW_STROKES : board.strokes;
  const background = preview ? 'dark' : board.background;
  const empty = strokes.length === 0;

  return (
    <PanelWidgetShell size={widget.size} className={styles.widget}>
      <div className={styles.board} data-bg={background} style={{ backgroundColor: BACKGROUND_CSS[background] }}>
        <WhiteboardSurface
          strokes={strokes}
          view={DEFAULT_VIEW}
          fitPadding={TILE_FIT_PADDING}
          interactive={false}
          ariaLabel={t('panel.widget.whiteboard.boardLabel')}
        />
        {empty && (
          <div className={styles.empty}>
            <PenLine className={styles.emptyIcon} aria-hidden />
            <span className={styles.emptyLabel}>{t('panel.widget.whiteboard.empty')}</span>
          </div>
        )}
      </div>
    </PanelWidgetShell>
  );
}

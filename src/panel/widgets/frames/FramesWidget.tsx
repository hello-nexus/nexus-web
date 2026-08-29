import { useTranslation } from '../../../lib/i18n';
import styles from './FramesWidget.module.scss';

/**
 * Placeholder tile: Frames has no panel presentation (its meta.listed is
 * false, so it never appears in the Add Widget catalog) - this exists only
 * because every registered App requires a Widget. Static text, no data
 * fetch, so it needs no preview fixture.
 */
export function FramesWidget() {
  const { t } = useTranslation();
  return <div className={styles.frames}>{t('panel.widget.frames')}</div>;
}

export default FramesWidget;

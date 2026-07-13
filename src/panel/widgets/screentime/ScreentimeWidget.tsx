import { useScreenTime } from '../../../hooks/useScreenTime';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { SCREENTIME_PREVIEW } from './screentimePreviewData';
import styles from './ScreentimeWidget.module.scss';

function formatHm(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function ScreentimeWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  // Hook stays mounted (store read only, no network); preview overrides data.
  const live = useScreenTime();
  const { history } = preview ? SCREENTIME_PREVIEW : live;

  // The taller tiles fit twice as many bars as the short ones.
  const maxApps = widget.size === '2x4' || widget.size === '4x4' ? 8 : 4;
  const top = history.slice().sort((a, b) => b.totalMs - a.totalMs).slice(0, maxApps);
  const maxMs = top.length > 0 ? top[0].totalMs : 1;

  return (
    <div className={styles.screentime}>
      {top.length === 0 ? (
        <div className={styles.empty}>{t('panel.screentime.empty')}</div>
      ) : (
        <ul className={styles.list}>
          {top.map(app => (
            <li key={app.name} className={styles.row}>
              <div className={styles.rowHead}>
                <span className={styles.rowName}>{app.name}</span>
                <span className={styles.rowValue}>{formatHm(app.totalMs)}</span>
              </div>
              <div className={styles.rowBar}>
                <div
                  className={styles.rowBarFill}
                  style={{ width: `${Math.round((app.totalMs / maxMs) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ScreentimeWidget;

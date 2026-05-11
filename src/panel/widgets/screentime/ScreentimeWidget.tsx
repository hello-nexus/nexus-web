import { useScreenTime } from '../../../hooks/useScreenTime';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
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
  const { focus, history } = useScreenTime();

  const totalMs = history.reduce((sum, app) => sum + app.totalMs, 0);
  const top = history.slice().sort((a, b) => b.totalMs - a.totalMs).slice(0, 4);
  const maxMs = top.length > 0 ? top[0].totalMs : 1;

  const showList = widget.size !== '2x2';

  return (
    <div className={styles.screentime}>
      <div className={styles.top}>
        <div>
          <div className={styles.label}>{t('panel.screentime.title')}</div>
          <div className={styles.total}>{formatHm(totalMs)}</div>
        </div>
        {focus ? <div className={styles.focus}>{focus.name}</div> : null}
      </div>
      {showList && (
        <ul className={styles.list}>
          {top.length === 0 ? (
            <li className={styles.empty}>{t('panel.screentime.empty')}</li>
          ) : (
            top.map(app => (
              <li key={app.name} className={styles.row}>
                <span className={styles.rowName}>{app.name}</span>
                <span className={styles.rowBar}>
                  <span
                    className={styles.rowBarFill}
                    style={{ width: `${Math.round((app.totalMs / maxMs) * 100)}%` }}
                  />
                </span>
                <span className={styles.rowValue}>{formatHm(app.totalMs)}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export default ScreentimeWidget;

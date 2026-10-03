import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { useUnitPrefs } from '../../hooks/useUiSettings';
import { hour12OptionFor } from '../../lib/units';
import { Card } from '../common/Card/Card';
import { Select } from '../common/Select/Select';
import { fetchAppTelemetryRecent, type AppTelemetryRecent } from '../../api/appTelemetry';
import { appIds, eventAppId, eventLabel, filterByApp, propertiesText } from './appTelemetryUtils';
import sharedStyles from './ToolsView.module.scss';
import styles from './AppTelemetryCard.module.scss';

const POLL_MS = 2000;

/** Live view of the app_* events the service recorded, for checking an app's track() calls. */
export function AppTelemetryCard() {
  const { t, language } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const [data, setData] = useState<AppTelemetryRecent | null>(null);
  const [failed, setFailed] = useState(false);
  const [appId, setAppId] = useState('');

  useEffect(() => {
    let alive = true;
    const poll = () => {
      void fetchAppTelemetryRecent().then(res => {
        if (!alive) return;
        setFailed(!res);
        if (res) setData(res);
      });
    };
    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const events = useMemo(() => data?.events ?? [], [data]);
  const shown = useMemo(() => filterByApp(events, appId), [events, appId]);
  const options = useMemo(
    () => [{ value: '', label: t('tools.appTelemetry.allApps') }, ...appIds(events).map(id => ({ value: id, label: id }))],
    [events, t],
  );
  const status = data?.posthog === 'on' ? t('tools.appTelemetry.status.on')
    : data?.posthog === 'opted_out' ? t('tools.appTelemetry.status.optedOut')
    : data ? t('tools.appTelemetry.status.off')
    : null;
  const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: hour12OptionFor(timeFormat) };

  return (
    <Card title={t('tools.appTelemetry.title')}>
      <span className={sharedStyles.dim}>{t('tools.appTelemetry.description')}</span>
      {failed && <span className={sharedStyles.dim}>{t('tools.appTelemetry.unavailable')}</span>}
      <div className={styles.controls}>
        {status && (
          <span className={data?.posthog === 'on' ? sharedStyles.good : sharedStyles.dim} role="status">{status}</span>
        )}
        <Select value={appId} options={options} onChange={setAppId} ariaLabel={t('tools.appTelemetry.filter')} />
      </div>
      {data && shown.length === 0 && <span className={sharedStyles.dim}>{t('tools.appTelemetry.empty')}</span>}
      {shown.length > 0 && (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('tools.appTelemetry.col.time')}</th>
                <th>{t('tools.appTelemetry.col.app')}</th>
                <th>{t('tools.appTelemetry.col.event')}</th>
                <th>{t('tools.appTelemetry.col.properties')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e, i) => (
                <tr key={`${e.at}-${i}`}>
                  <td>{new Date(e.at).toLocaleTimeString(language, timeOpts)}</td>
                  <td>{eventAppId(e)}</td>
                  <td>{eventLabel(e)}</td>
                  <td>{propertiesText(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

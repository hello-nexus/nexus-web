import { useId, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { Button } from '../../common/Button/Button';
import { Notice, NoticeHeadline, NoticeSecondary } from '../../common/Notice/Notice';
import { alertBannerText } from './sensorAlertHelpers';
import styles from './SensorAlertsBanner.module.scss';

export interface BannerAlert {
  rule: SensorAlertRule;
  state: SensorAlertState;
}

interface SensorAlertsBannerProps {
  alerts: readonly BannerAlert[];
  nowMs: number;
  /** Acknowledges one alert; resolves true once the service accepted it. */
  onDismiss: (ruleId: string) => Promise<boolean>;
}

function AlertRow({ alert, nowMs, onDismiss }: { alert: BannerAlert; nowMs: number; onDismiss: (ruleId: string) => Promise<boolean> }) {
  const { t, language } = useTranslation();
  const prefs = useUnitPrefs();
  const [dismissing, setDismissing] = useState(false);
  const { title, detail } = alertBannerText(t, alert.rule, alert.state, prefs, language, nowMs);
  return (
    <li className={styles.item}>
      <div className={styles.text}>
        <NoticeHeadline>{title}</NoticeHeadline>
        <NoticeSecondary>{detail}</NoticeSecondary>
      </div>
      <Button
        type="button" size="sm" disabled={dismissing} data-testid="sensor-banner-dismiss"
        onClick={() => {
          if (dismissing) return;
          setDismissing(true);
          void onDismiss(alert.rule.id).finally(() => setDismissing(false));
        }}
      >
        {t('diagnostics.sensors.dismissAlert')}
      </Button>
    </li>
  );
}

/** One banner for several Watchlist alerts, collapsed to a count in the highest level's tone and expandable to each alert with its own dismiss. */
export function SensorAlertsBanner({ alerts, nowMs, onDismiss }: SensorAlertsBannerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const critical = alerts.some(a => a.state.state === 'active' && a.rule.severity === 'act');
  return (
    <Notice
      tone={critical ? 'critical' : 'warning'}
      role="status"
      actions={(
        <Button
          type="button" size="sm" data-testid="sensor-banner-toggle"
          aria-expanded={open} aria-controls={listId}
          onClick={() => setOpen(v => !v)}
        >
          {t(open ? 'diagnostics.sensors.alerts.hide' : 'diagnostics.sensors.alerts.show')}
        </Button>
      )}
    >
      <NoticeHeadline>{t('diagnostics.sensors.alerts.title', { count: alerts.length })}</NoticeHeadline>
      {open && (
        <ul id={listId} className={styles.list}>
          {alerts.map(a => <AlertRow key={a.rule.id} alert={a} nowMs={nowMs} onDismiss={onDismiss} />)}
        </ul>
      )}
    </Notice>
  );
}

import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useSensorAlerts } from '../../../hooks/useSensorAlerts';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { Button } from '../../common/Button/Button';
import { Notice } from '../../common/Notice/Notice';
import { activeAlerts, alertLine, sensorLabel } from './sensorAlertHelpers';
import styles from './SensorAlertsSection.module.scss';

type ActiveAlert = { rule: SensorAlertRule; state: SensorAlertState };

interface ActiveAlertsNoticeViewProps {
  alerts: ActiveAlert[];
  onAcknowledge: (ruleId: string) => void;
  onOpenSettings: () => void;
}

/** One notice per severity (watch in the warn tone, act in the bad tone) listing the active sensor alerts. */
export function ActiveAlertsNoticeView({ alerts, onAcknowledge, onOpenSettings }: ActiveAlertsNoticeViewProps) {
  const { t } = useTranslation();
  const prefs = useUnitPrefs();
  if (alerts.length === 0) return null;

  const groups = [
    { tone: 'critical' as const, items: alerts.filter(a => a.rule.severity === 'act') },
    { tone: 'warning' as const, items: alerts.filter(a => a.rule.severity !== 'act') },
  ].filter(g => g.items.length > 0);

  return (
    <div className={styles.noticeStack}>
      {groups.map((group, i) => (
        <Notice
          key={group.tone}
          tone={group.tone}
          role="status"
          actions={i === 0 && (
            <Button type="button" size="sm" tone="neutral" onClick={onOpenSettings}>
              {t('diagnostics.alerts.notice.openSettings')}
            </Button>
          )}
        >
          <strong>{t('diagnostics.alerts.title')}</strong>
          {group.items.map(item => (
            <div key={item.rule.id} className={styles.alertRow}>
              <span className={styles.alertText}>{alertLine(t, item.rule, item.state, prefs)}</span>
              <Button
                type="button" size="sm" tone="neutral"
                aria-label={t('diagnostics.alerts.acknowledgeFor', { name: sensorLabel(item.rule.sensor) })}
                onClick={() => onAcknowledge(item.rule.id)}
              >
                {t('diagnostics.alerts.acknowledge')}
              </Button>
            </div>
          ))}
        </Notice>
      ))}
    </div>
  );
}

interface ActiveAlertsNoticeProps {
  onOpenSettings: () => void;
}

export function ActiveAlertsNotice({ onOpenSettings }: ActiveAlertsNoticeProps) {
  const { rules, states, acknowledge } = useSensorAlerts(true);
  return (
    <ActiveAlertsNoticeView
      alerts={activeAlerts(rules, states)}
      onAcknowledge={id => { void acknowledge(id); }}
      onOpenSettings={onOpenSettings}
    />
  );
}

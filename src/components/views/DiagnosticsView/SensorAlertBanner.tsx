import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import type { SensorAlertRule, SensorAlertState } from '../../../api/diagnosticsAlerts';
import { Button } from '../../common/Button/Button';
import { Notice, NoticeHeadline, NoticeSecondary } from '../../common/Notice/Notice';
import { alertBannerText } from './sensorAlertHelpers';

interface SensorAlertBannerProps {
  rule: SensorAlertRule;
  state: SensorAlertState;
  /** The current time, to tell a start today from an earlier day. */
  nowMs: number;
  /** Acknowledges the alert; resolves true once the service accepted it. */
  onDismiss: () => Promise<boolean>;
}

/** The banner for one active sensor alert, the same Notice as the Cooling tab's thermal guard trip: warning for a watch rule, critical for an act rule. */
export function SensorAlertBanner({ rule, state, nowMs, onDismiss }: SensorAlertBannerProps) {
  const { t, language } = useTranslation();
  const prefs = useUnitPrefs();
  const [dismissing, setDismissing] = useState(false);
  const { title, detail } = alertBannerText(t, rule, state, prefs, language, nowMs);

  return (
    <Notice
      tone={rule.severity === 'act' ? 'critical' : 'warning'}
      role="status"
      actions={(
        <Button
          type="button" size="sm" disabled={dismissing} data-testid="sensor-banner-dismiss"
          onClick={() => {
            if (dismissing) return;
            setDismissing(true);
            void onDismiss().finally(() => setDismissing(false));
          }}
        >
          {t('diagnostics.cooling.guardTrip.dismiss')}
        </Button>
      )}
    >
      <NoticeHeadline>{title}</NoticeHeadline>
      <NoticeSecondary>{detail}</NoticeSecondary>
    </Notice>
  );
}

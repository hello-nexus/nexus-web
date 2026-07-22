import { SettingsSection } from '../../../../components/common/SettingsSection/SettingsSection';
import { SettingToggle } from '../../../../components/common/SettingRow/SettingRow';
import { useTranslation } from '../../../../lib/i18n';
import { useUiSettings } from '../../../../hooks/useUiSettings';
import { MONITORING_EVENT_KINDS } from '../../../../api/monitoringEvents';
import { CHART_EVENT_ICONS } from '../../../../components/common/TimeSeriesChart/TimeSeriesChart';
import { useEventKindVisibility } from './useEventKindVisibility';
import { eventKindLabel } from './monitoringEventLabels';

/**
 * The timeline-events settings block: a master on/off plus a per-kind toggle
 * carrying that kind's own marker icon. One component, one preference
 * (eventsEnabled + the eventKindsHidden set via useEventKindVisibility) -
 * rendered both in the monitoring page's gear dialog and in the app's
 * Settings > Monitoring tab, so the two surfaces cannot drift.
 */
export function MonitoringEventsSettings() {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const { isHidden, setKindHidden } = useEventKindVisibility();
  const enabled = settings.monitoringEventsEnabled;

  return (
    <SettingsSection
      title={t('monitoring.events.settingsTitle')}
      description={t('monitoring.events.settingsDescription')}
    >
      <SettingToggle
        label={t('monitoring.events.enableLabel')}
        checked={enabled}
        onChange={v => update({ monitoringEventsEnabled: v })}
      />
      {MONITORING_EVENT_KINDS.map(kind => {
        const Icon = CHART_EVENT_ICONS[kind];
        const label = eventKindLabel(t, kind);
        return (
          <SettingToggle
            key={kind}
            icon={<Icon size={16} aria-hidden />}
            label={label}
            checked={!isHidden(kind)}
            onChange={next => setKindHidden(kind, !next)}
            disabled={!enabled}
          />
        );
      })}
    </SettingsSection>
  );
}

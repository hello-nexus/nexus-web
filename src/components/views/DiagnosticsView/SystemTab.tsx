import type { DiagnosticsFetchOptions, DiagnosticsIncidentsResponse, DiagnosticsSystemResponse } from '../../../api/diagnostics';
import { IncidentsSection } from './IncidentsSection';
import { IncidentCounts } from './IncidentCounts';
import { SystemSection } from './SystemSection';
import type { IncidentRangeHours } from './incidentTimelineHelpers';
import styles from './DiagnosticsView.module.scss';

interface SystemTabProps {
  platform: string;
  system: {
    data: DiagnosticsSystemResponse | null;
    loading: boolean;
    error: boolean;
    refresh: (opts?: DiagnosticsFetchOptions) => void;
  };
  incidents: {
    data: DiagnosticsIncidentsResponse | null;
    loading: boolean;
    error: boolean;
    refresh: () => void;
  };
  onLogsCleared: () => void;
  incidentHours: IncidentRangeHours;
  incidentDate: string | null;
  onIncidentHoursChange: (hours: IncidentRangeHours) => void;
  onIncidentDateChange: (date: string) => void;
}

/** System tab: the incident timeline (with its log actions + clicked-event
 *  detail), then a two-column row under it - the "Last 30 days" counters on the
 *  left and the Device Manager problems on the right. */
export function SystemTab({
  platform, system, incidents, onLogsCleared, incidentHours, incidentDate, onIncidentHoursChange, onIncidentDateChange,
}: SystemTabProps) {
  return (
    <>
      <IncidentsSection
        data={incidents.data} loading={incidents.loading} error={incidents.error}
        onRefresh={incidents.refresh} onLogsCleared={onLogsCleared}
        hours={incidentHours} date={incidentDate}
        onHoursChange={onIncidentHoursChange} onDateChange={onIncidentDateChange}
        platform={platform}
      />
      <div className={styles.diagSplit}>
        {platform === 'windows' && <IncidentCounts counts30d={system.data?.counts30d ?? null} />}
        <SystemSection data={system.data} loading={system.loading} error={system.error} onRefresh={system.refresh} />
      </div>
    </>
  );
}

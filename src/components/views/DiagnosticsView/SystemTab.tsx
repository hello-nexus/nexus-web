import type { DiagnosticsFetchOptions, DiagnosticsIncidentsResponse, DiagnosticsSystemResponse } from '../../../api/diagnostics';
import { IncidentsSection } from './IncidentsSection';
import { SystemSection } from './SystemSection';
import type { IncidentRangeHours } from './incidentTimelineHelpers';

interface SystemTabProps {
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

/** System tab: the incident timeline (with its log actions, clicked-event
 *  detail, and 30-day counters), then the Device Manager problems under it. */
export function SystemTab({
  system, incidents, onLogsCleared, incidentHours, incidentDate, onIncidentHoursChange, onIncidentDateChange,
}: SystemTabProps) {
  return (
    <>
      <IncidentsSection
        data={incidents.data} loading={incidents.loading} error={incidents.error}
        onRefresh={incidents.refresh} onLogsCleared={onLogsCleared}
        counts30d={system.data?.counts30d ?? null}
        hours={incidentHours} date={incidentDate}
        onHoursChange={onIncidentHoursChange} onDateChange={onIncidentDateChange}
      />
      <SystemSection data={system.data} loading={system.loading} error={system.error} onRefresh={system.refresh} />
    </>
  );
}

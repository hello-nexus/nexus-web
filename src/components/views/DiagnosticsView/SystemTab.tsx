import type { DiagnosticsFetchOptions, DiagnosticsIncidentsResponse, DiagnosticsSystemResponse } from '../../../api/diagnostics';
import { IncidentsSection } from './IncidentsSection';
import { SystemSection } from './SystemSection';

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
}

/** System tab: the last-30-days counters + PnP problems, followed by Incidents (Open Event Viewer / Clear logs). */
export function SystemTab({ system, incidents, onLogsCleared }: SystemTabProps) {
  return (
    <>
      <SystemSection data={system.data} loading={system.loading} error={system.error} onRefresh={system.refresh} />
      <IncidentsSection
        data={incidents.data} loading={incidents.loading} error={incidents.error}
        onRefresh={incidents.refresh} onLogsCleared={onLogsCleared}
      />
    </>
  );
}

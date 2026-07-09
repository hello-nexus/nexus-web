import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { DiagnosticsView } from '../../../components/views/DiagnosticsView/DiagnosticsView';

interface DiagnosticsPageProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
}

// Thin wrapper so the desktop dashboard route and the AppManifest's Page slot
// both resolve to the same DiagnosticsView the deliverable specifies under
// components/views/, instead of duplicating its content here.
export function DiagnosticsPage({ serviceOnline, connectionState }: DiagnosticsPageProps) {
  return <DiagnosticsView serviceOnline={serviceOnline} connectionState={connectionState} />;
}

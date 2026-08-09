import type { ConnectionState } from '../../../hooks/useServiceStatus';
import { DiagnosticsView } from '../../../components/views/DiagnosticsView/DiagnosticsView';

interface DiagnosticsPageProps {
  serviceOnline: boolean;
  connectionState?: ConnectionState;
  platform: string;
  // Controlled tab = the route subtab (so /diagnostics/cooling deep-links).
  tab: string | null;
  onTabChange: (tab: string) => void;
}

// Thin wrapper so the desktop dashboard route and the AppManifest's Page slot
// both resolve to the same DiagnosticsView the deliverable specifies under
// components/views/, instead of duplicating its content here.
export function DiagnosticsPage({ serviceOnline, connectionState, platform, tab, onTabChange }: DiagnosticsPageProps) {
  return (
    <DiagnosticsView serviceOnline={serviceOnline} connectionState={connectionState} platform={platform} tab={tab} onTabChange={onTabChange} />
  );
}

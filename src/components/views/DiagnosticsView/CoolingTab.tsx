import type { DiagnosticsCoolingResponse, DiagnosticsFetchOptions, DiagnosticsGpuResponse, DiagnosticsTemperatureEpisode } from '../../../api/diagnostics';
import type { UseMetricHistoryResult } from '../../../hooks/useMetricHistory';
import { useTranslation } from '../../../lib/i18n';
import { CoolingHistorySection } from './CoolingHistorySection';
import { CoolingSection } from './CoolingSection';
import { GpuSection } from './GpuSection';
import styles from './DiagnosticsView.module.scss';

interface CoolingTabProps {
  cooling: {
    data: DiagnosticsCoolingResponse | null;
    loading: boolean;
    error: boolean;
    refresh: (opts?: DiagnosticsFetchOptions) => void;
  };
  gpu: {
    data: DiagnosticsGpuResponse | null;
    loading: boolean;
    error: boolean;
    refresh: (opts?: DiagnosticsFetchOptions) => void;
  };
  coolingHistory: UseMetricHistoryResult;
  episodes: readonly DiagnosticsTemperatureEpisode[];
}

/**
 * Cooling tab: the temperature history chart above the fan/pump list, with GPU
 * health (throttle / TDR / power) folded in below - GPU no longer has its own
 * tab, and its temperature already rides the chart above. The history hook
 * instance and the episodes fetch live in DiagnosticsView (not here) so they
 * persist across tab switches instead of resetting every time the user leaves
 * and returns to this tab.
 */
export function CoolingTab({ cooling, gpu, coolingHistory, episodes }: CoolingTabProps) {
  const { t } = useTranslation();
  return (
    <>
      <CoolingHistorySection history={coolingHistory} episodes={episodes} />
      <div className={styles.diagSplit}>
        <GpuSection
          data={gpu.data} loading={gpu.loading} error={gpu.error} onRefresh={gpu.refresh}
          heading={t('diagnostics.kind.gpu')}
        />
        <CoolingSection
          data={cooling.data} loading={cooling.loading} error={cooling.error} onRefresh={cooling.refresh}
          heading={t('diagnostics.cooling.fansTitle')}
        />
      </div>
    </>
  );
}

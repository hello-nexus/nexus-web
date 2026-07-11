import type {
  DiagnosticsCoolingResponse,
  DiagnosticsFetchOptions,
  DiagnosticsGpuResponse,
  DiagnosticsTemperatureAppsResponse,
  DiagnosticsTemperaturesResponse,
} from '../../../api/diagnostics';
import { useTranslation } from '../../../lib/i18n';
import { CoolingSection } from './CoolingSection';
import { GpuSection } from './GpuSection';
import { TemperatureSection } from './TemperatureSection';
import type { TemperatureRangeHours } from './temperatureHelpers';

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
  temperatures: {
    data: DiagnosticsTemperaturesResponse | null;
    loading: boolean;
    error: boolean;
    mocked: boolean;
    refresh: () => void;
  };
  hours: TemperatureRangeHours;
  date: string | null;
  onHoursChange: (hours: TemperatureRangeHours) => void;
  onDateChange: (date: string) => void;
  appUsageData: DiagnosticsTemperatureAppsResponse | null;
}

/**
 * Cooling tab: the temperature history chart above the fan/pump list, with GPU
 * health (throttle / TDR / power) folded in below - GPU no longer has its own
 * tab, and its temperature already rides the chart above. Range state and the
 * temperatures fetch live in DiagnosticsView (not here) so they persist across
 * tab switches instead of resetting to the default range every time the user
 * leaves and returns to this tab.
 */
export function CoolingTab({ cooling, gpu, temperatures, hours, date, onHoursChange, onDateChange, appUsageData }: CoolingTabProps) {
  const { t } = useTranslation();
  return (
    <>
      <TemperatureSection
        data={temperatures.data}
        loading={temperatures.loading}
        error={temperatures.error}
        mocked={temperatures.mocked}
        hours={hours}
        date={date}
        onHoursChange={onHoursChange}
        onDateChange={onDateChange}
        onRetry={temperatures.refresh}
        appUsageData={appUsageData}
      />
      <CoolingSection data={cooling.data} loading={cooling.loading} error={cooling.error} onRefresh={cooling.refresh} />
      <GpuSection
        data={gpu.data} loading={gpu.loading} error={gpu.error} onRefresh={gpu.refresh}
        heading={t('diagnostics.kind.gpu')}
      />
    </>
  );
}

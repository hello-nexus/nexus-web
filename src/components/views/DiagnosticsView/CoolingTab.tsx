import type { DiagnosticsCoolingResponse, DiagnosticsFetchOptions, DiagnosticsTemperatureAppsResponse, DiagnosticsTemperaturesResponse } from '../../../api/diagnostics';
import { CoolingSection } from './CoolingSection';
import { TemperatureSection } from './TemperatureSection';
import type { TemperatureRangeHours } from './temperatureHelpers';

interface CoolingTabProps {
  cooling: {
    data: DiagnosticsCoolingResponse | null;
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
 * Cooling tab: the temperature history chart above the fan/pump list. Range
 * state and the temperatures fetch live in DiagnosticsView (not here) so
 * they persist across tab switches instead of resetting to the default
 * range every time the user leaves and returns to this tab.
 */
export function CoolingTab({ cooling, temperatures, hours, date, onHoursChange, onDateChange, appUsageData }: CoolingTabProps) {
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
    </>
  );
}

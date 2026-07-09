import { useState } from 'react';
import { useDiagnosticsTemperatures } from '../../../hooks/useDiagnosticsTemperatures';
import type { DiagnosticsCoolingResponse, DiagnosticsFetchOptions } from '../../../api/diagnostics';
import { CoolingSection } from './CoolingSection';
import { TemperatureSection } from './TemperatureSection';
import { DEFAULT_TEMPERATURE_RANGE_HOURS, type TemperatureRangeHours } from './temperatureHelpers';

interface CoolingTabProps {
  serviceOnline: boolean;
  cooling: {
    data: DiagnosticsCoolingResponse | null;
    loading: boolean;
    error: boolean;
    refresh: (opts?: DiagnosticsFetchOptions) => void;
  };
}

/**
 * Cooling tab: the temperature history chart above the fan/pump list. The
 * range picker lives here (not centralized in DiagnosticsView) since
 * temperature history is only ever needed on this tab - visiting it is what
 * triggers the fetch, and changing the range refetches independently of the
 * rest of the page.
 */
export function CoolingTab({ serviceOnline, cooling }: CoolingTabProps) {
  const [hours, setHours] = useState<TemperatureRangeHours>(DEFAULT_TEMPERATURE_RANGE_HOURS);
  const temperatures = useDiagnosticsTemperatures(serviceOnline, hours);

  return (
    <>
      <TemperatureSection
        data={temperatures.data}
        loading={temperatures.loading}
        error={temperatures.error}
        mocked={temperatures.mocked}
        hours={hours}
        onHoursChange={setHours}
        onRetry={temperatures.refresh}
      />
      <CoolingSection data={cooling.data} loading={cooling.loading} error={cooling.error} onRefresh={cooling.refresh} />
    </>
  );
}

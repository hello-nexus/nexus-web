import { useCallback, useEffect, useState } from 'react';
import { fetchPreferences, savePreferences } from '../../api/profiles';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { DEFAULT_GAUGE_GRADIENT, normalizeGaugeGradient, type GaugeGradientStop } from '../theme/gaugeGradient';

interface UseDashboardGaugeGradientResult {
  stops: readonly GaugeGradientStop[];
  /** Local only, for a drag in progress. */
  preview: (next: readonly GaugeGradientStop[]) => void;
  commit: (next: readonly GaugeGradientStop[]) => void;
}

// The desktop dashboard has no device record, so its gauge gradient lives in
// the profile next to the dashboard layout (see useDashboardLayout).
export function useDashboardGaugeGradient(enabled: boolean): UseDashboardGaugeGradientResult {
  const [stops, setStops] = useState<readonly GaugeGradientStop[]>(DEFAULT_GAUGE_GRADIENT);

  const fetchStops = useCallback(() => {
    if (!enabled) return;
    fetchPreferences()
      .then(prefs => setStops(normalizeGaugeGradient(prefs?.panel?.dashboardGaugeGradient)))
      .catch(() => {});
  }, [enabled]);

  useEffect(() => { fetchStops(); }, [fetchStops]);
  useTopicCallback('prefs', enabled, fetchStops);

  const preview = useCallback((next: readonly GaugeGradientStop[]) => {
    setStops(normalizeGaugeGradient(next));
  }, []);

  const commit = useCallback((next: readonly GaugeGradientStop[]) => {
    const normalized = normalizeGaugeGradient(next);
    setStops(normalized);
    savePreferences({ panel: { dashboardGaugeGradient: normalized } }).catch(() => {});
  }, []);

  return { stops, preview, commit };
}

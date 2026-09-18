import { useCallback, useEffect, useState } from 'react';
import { fetchPreferences, savePreferences } from '../../api/profiles';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { DEFAULT_GAUGE_GRADIENT, gaugeGradientEquals, normalizeGaugeGradient, type GaugeGradientStop } from '../theme/gaugeGradient';

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
      .then(prefs => {
        const next = normalizeGaugeGradient(prefs?.panel?.dashboardGaugeGradient);
        // Every prefs broadcast refetches; keep the reference when nothing moved.
        setStops(prev => (gaugeGradientEquals(prev, next) ? prev : next));
      })
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

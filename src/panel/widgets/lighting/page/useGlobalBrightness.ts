import { useCallback, useEffect, useState } from 'react';
import { fetchGlobalBrightness } from '../../../../api/lighting';
import { useTopicCallback } from '../../../../hooks/useMultiplexSocket';

/**
 * Read-only view of the master brightness as a percent (0..100), kept in sync
 * with the `lighting` topic that every /lighting/* mutation publishes. Null
 * until the first fetch resolves. The writer side (drag, throttled POST, local
 * edit window) lives in GlobalBrightnessSlider; consumers that only need the
 * value - e.g. the per-device effective-brightness indicator - use this.
 */
export function useGlobalBrightness(): number | null {
  const [percent, setPercent] = useState<number | null>(null);

  const refresh = useCallback(() => {
    fetchGlobalBrightness().then(data => {
      if (!data) return;
      setPercent(Math.round(Math.max(0, Math.min(1, data.value)) * 100));
    }).catch(() => { /* best-effort */ });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useTopicCallback('lighting', true, refresh);

  return percent;
}

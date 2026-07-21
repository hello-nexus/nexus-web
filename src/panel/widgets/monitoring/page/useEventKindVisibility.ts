import { useCallback, useMemo } from 'react';
import { useUiSettings } from '../../../../hooks/useUiSettings';
import type { MonitoringEventKind, TimelineEvent } from '../../../../api/monitoringEvents';

/**
 * Per-kind visibility of timeline events, persisted as the hidden set so a
 * kind added in a later release shows by default instead of being silently
 * invisible to existing users. The settings rows and the events modal's
 * "ignore this type" action both write through here, so they cannot drift.
 */
export function useEventKindVisibility() {
  const { settings, update } = useUiSettings();

  const hidden = useMemo(
    () => new Set(settings.monitoringEventKindsHidden),
    [settings.monitoringEventKindsHidden],
  );

  const isHidden = useCallback((kind: MonitoringEventKind) => hidden.has(kind), [hidden]);

  const setKindHidden = useCallback((kind: MonitoringEventKind, hide: boolean) => {
    const next = new Set(hidden);
    if (hide) next.add(kind);
    else next.delete(kind);
    update({ monitoringEventKindsHidden: [...next] });
  }, [hidden, update]);

  const visibleEvents = useCallback(
    (events: readonly TimelineEvent[]) => events.filter(e => !hidden.has(e.kind)),
    [hidden],
  );

  return { isHidden, setKindHidden, visibleEvents };
}

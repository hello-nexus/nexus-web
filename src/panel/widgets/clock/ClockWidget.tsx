import { useEffect, useState } from 'react';
import type { WidgetProps } from '../types';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { resolveHour12 } from '../../../lib/units';
import { CLOCK_DESIGNS, type ClockLayout } from './designs';
import { safeTimeZone } from './timezones';

/**
 * Clock widget dispatcher. Reads the design key from config and
 * delegates to the matching design sub-component. Falls back to
 * the digital design when no key is set or the key is unrecognized.
 */
export function ClockWidget({ widget }: WidgetProps) {
  const [now, setNow] = useState(() => new Date());
  const { timeFormat } = useUnitPrefs();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const designKey = ((widget.config?.design as string | undefined) ?? 'digital');
  const entry = CLOCK_DESIGNS[designKey] ?? CLOCK_DESIGNS['digital'];
  const Design = entry.component;

  const showSeconds = ((widget.config?.showSeconds as boolean | undefined) ?? false);
  const showDate = ((widget.config?.showDate as boolean | undefined) ?? true);
  const showTimezone = ((widget.config?.showTimezone as boolean | undefined) ?? false);
  // A stale or partial config value (e.g. a half-typed zone saved by an older
  // build) must never reach Intl.DateTimeFormat - it throws and crashes the
  // panel. safeTimeZone collapses anything invalid to local time.
  const tz = safeTimeZone(widget.config?.timezone as string | undefined);
  // 'auto' (the default) follows the global Units time-format; an explicit
  // 12h/24h pick on this widget overrides it.
  const formatCfg = ((widget.config?.format as string | undefined) ?? 'auto');
  const hour12 = formatCfg === 'auto' ? resolveHour12(timeFormat) : formatCfg === '12h';
  const useAccentColor = ((widget.config?.useAccentColor as boolean | undefined) ?? false);
  // Horizontal is the default everywhere; stacked is opt-in per widget and is
  // ignored by a design that cannot split the time into lines (analog).
  const layout: ClockLayout = widget.config?.layout === 'stacked' && entry.stackable ? 'stacked' : 'horizontal';

  return (
    <Design
      now={now}
      tz={tz}
      showSeconds={showSeconds}
      showDate={showDate}
      showTimezone={showTimezone}
      size={widget.size}
      hour12={hour12}
      useAccentColor={useAccentColor}
      layout={layout}
    />
  );
}

export default ClockWidget;

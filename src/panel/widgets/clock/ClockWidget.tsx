import { useEffect, useState } from 'react';
import type { WidgetProps } from '../types';
import { CLOCK_DESIGNS } from './designs';
import { safeTimeZone } from './timezones';

/**
 * Clock widget dispatcher. Reads the design key from config and
 * delegates to the matching design sub-component. Falls back to
 * the digital design when no key is set or the key is unrecognized.
 */
export function ClockWidget({ widget }: WidgetProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const designKey = ((widget.config?.design as string | undefined) ?? 'digital');
  const entry = CLOCK_DESIGNS[designKey] ?? CLOCK_DESIGNS['digital'];
  const Design = entry.component;

  const showSeconds = ((widget.config?.showSeconds as boolean | undefined) ?? false);
  const showDate = ((widget.config?.showDate as boolean | undefined) ?? true);
  // A stale or partial config value (e.g. a half-typed zone saved by an older
  // build) must never reach Intl.DateTimeFormat - it throws and crashes the
  // panel. safeTimeZone collapses anything invalid to local time.
  const tz = safeTimeZone(widget.config?.timezone as string | undefined);
  const hour12 = (((widget.config?.format as string | undefined) ?? '24h') === '12h');
  const useAccentColor = ((widget.config?.useAccentColor as boolean | undefined) ?? false);

  return (
    <Design
      now={now}
      tz={tz}
      showSeconds={showSeconds}
      showDate={showDate}
      size={widget.size}
      hour12={hour12}
      useAccentColor={useAccentColor}
    />
  );
}

export default ClockWidget;

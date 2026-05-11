import { useEffect, useState } from 'react';
import type { WidgetProps } from '../types';
import { CLOCK_DESIGNS } from './designs';

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

  const designKey = widget.config?.design?.s ?? 'digital';
  const entry = CLOCK_DESIGNS[designKey] ?? CLOCK_DESIGNS['digital'];
  const Design = entry.component;

  const showSeconds = widget.config?.showSeconds?.b ?? false;
  const showDate = widget.config?.showDate?.b ?? true;
  const tz = widget.config?.timezone?.s;
  const hour12 = (widget.config?.format?.s ?? '24h') === '12h';
  const useAccentColor = widget.config?.useAccentColor?.b ?? false;

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

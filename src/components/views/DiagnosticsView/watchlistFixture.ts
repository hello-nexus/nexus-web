import type { SensorAlertRule } from '../../../api/diagnosticsAlerts';

const TYPES = ['Temperature', 'Fan', 'Load', 'Voltage', 'Power', 'Clock'] as const;

/** `count` watchlist entries spread over six unit groups, built-ins first in each, for layout checks. */
export function watchlistFixture(count: number): SensorAlertRule[] {
  return Array.from({ length: count }, (_, i) => {
    const type = TYPES[i % TYPES.length];
    const builtIn = i < TYPES.length * 2 && (type === 'Temperature' || type === 'Fan');
    return {
      id: builtIn ? `builtin:${type.toLowerCase()}:${i}` : `rule-${i}`,
      enabled: i % 5 !== 0,
      sensor: { category: builtIn ? 'builtin' : 'motherboard', id: `s${i}`, name: `${type} sensor ${i}`, type, parentName: '' },
      low: null, high: 80, raiseAfterSeconds: 5, clearAfterSeconds: 5, severity: 'watch',
      notifyDesktop: false, notifyMobile: false, showInHealth: true, repeatMinutes: 0,
      builtIn: builtIn ? (type === 'Fan' ? 'fanSpeed' : 'cpuTemp') : null,
    } satisfies SensorAlertRule;
  });
}

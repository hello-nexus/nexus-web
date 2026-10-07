import { CloudOff, WifiOff, type LucideIcon } from 'lucide-react';
import type { WeatherSnapshot } from '../../../api/weather';

export type WeatherProblem = 'service' | 'network' | 'unknown';

// Why there is no weather to show, or null when there is a forecast. An
// empty asOf is the service's no-data marker; an older service sends it
// without a reason, and a null snapshot means the Nexus service itself did
// not answer (read as no connection).
export function weatherProblem(snap: WeatherSnapshot | null, loaded: boolean): WeatherProblem | null {
  if (!loaded) return null;
  if (!snap) return 'network';
  if (snap.asOf) return null;
  return snap.unavailable ?? 'unknown';
}

export const WEATHER_PROBLEM_KEY: Record<WeatherProblem, string> = {
  service: 'panel.widget.weather.serviceUnavailable',
  network: 'panel.widget.offline',
  unknown: 'panel.widget.weather.noData',
};

export const WEATHER_PROBLEM_ICON: Record<WeatherProblem, LucideIcon> = {
  service: CloudOff,
  network: WifiOff,
  unknown: CloudOff,
};

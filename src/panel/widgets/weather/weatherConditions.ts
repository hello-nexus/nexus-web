// WMO weather code -> i18n key. The service sends an English `condition`
// string alongside the code (nexus-service OpenMeteoWeatherProvider.
// ConditionFor); the panel translates the code itself and keeps that string
// only as the fallback for a code this table does not cover.
// Groups match the icon ranges in WeatherIcon.
export function weatherConditionKey(code: number | null | undefined): string | null {
  if (code === null || code === undefined || code < 0) return null;
  if (code === 0) return 'panel.widget.weather.cond.clear';
  if (code === 1 || code === 2) return 'panel.widget.weather.cond.partlyCloudy';
  if (code === 3) return 'panel.widget.weather.cond.overcast';
  if (code === 45 || code === 48) return 'panel.widget.weather.cond.fog';
  if (code >= 51 && code <= 55) return 'panel.widget.weather.cond.drizzle';
  if (code === 56 || code === 57) return 'panel.widget.weather.cond.freezingDrizzle';
  if (code >= 61 && code <= 65) return 'panel.widget.weather.cond.rain';
  if (code === 66 || code === 67) return 'panel.widget.weather.cond.freezingRain';
  if (code >= 71 && code <= 75) return 'panel.widget.weather.cond.snow';
  if (code === 77) return 'panel.widget.weather.cond.snowGrains';
  if (code >= 80 && code <= 82) return 'panel.widget.weather.cond.rainShowers';
  if (code === 85 || code === 86) return 'panel.widget.weather.cond.snowShowers';
  if (code === 95) return 'panel.widget.weather.cond.thunderstorm';
  if (code === 96 || code === 99) return 'panel.widget.weather.cond.thunderstormHail';
  return null;
}

// 24-hour surfaces show the bare hour; 12-hour keeps the tight "10AM" form the
// six-column strip is sized for, with a translated suffix.
export function formatWeatherHour(
  time: string,
  hour12: boolean,
  amLabel: string,
  pmLabel: string,
): string {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return time.split('T')[1]?.slice(0, 5) || '';
  const hour = date.getHours();
  if (!hour12) return String(hour).padStart(2, '0');
  return `${hour % 12 || 12}${hour >= 12 ? pmLabel : amLabel}`;
}

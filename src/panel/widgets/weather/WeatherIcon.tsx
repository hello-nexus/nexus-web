import {
  Sun, Moon, Cloud, CloudSun, CloudMoon, CloudFog, CloudDrizzle, CloudRain,
  CloudSnow, CloudRainWind, CloudLightning, HelpCircle,
} from 'lucide-react';

// WMO code -> glyph. `isDay=false` swaps the sun glyphs for moon ones; the
// tile passes nothing and keeps the daytime set.
export function WeatherIcon({
  code,
  isDay,
  className,
  strokeWidth,
}: {
  code: number | null | undefined;
  isDay?: boolean | null;
  className: string;
  strokeWidth: number;
}) {
  const night = isDay === false;
  if (code === null || code === undefined) return <HelpCircle className={className} strokeWidth={strokeWidth} />;
  if (code === 0 || code === 1) return night
    ? <Moon className={className} strokeWidth={strokeWidth} />
    : <Sun className={className} strokeWidth={strokeWidth} />;
  if (code === 2) return night
    ? <CloudMoon className={className} strokeWidth={strokeWidth} />
    : <CloudSun className={className} strokeWidth={strokeWidth} />;
  if (code === 3) return <Cloud className={className} strokeWidth={strokeWidth} />;
  if (code === 45 || code === 48) return <CloudFog className={className} strokeWidth={strokeWidth} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle className={className} strokeWidth={strokeWidth} />;
  if (code >= 61 && code <= 67) return <CloudRain className={className} strokeWidth={strokeWidth} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className={className} strokeWidth={strokeWidth} />;
  if (code >= 80 && code <= 82) return <CloudRainWind className={className} strokeWidth={strokeWidth} />;
  if (code >= 95 && code <= 99) return <CloudLightning className={className} strokeWidth={strokeWidth} />;
  return <HelpCircle className={className} strokeWidth={strokeWidth} />;
}

// Weather — SDK port of the declarative Tier-2 weather widget. Imitates it
// feature-for-feature: ipwho.is geolocation (or manual coords), OpenMeteo
// current + hourly + 5-day forecast, auto unit by country, and three
// responsive layouts. The fetch/parse logic that lived in worker.js + the
// declarative view tree both become plain React here.

import { useEffect, useMemo, useRef, useState } from 'react';
import { mount, useSettings, useSize, request } from '@hellonexus/sdk';
import { Stack, Text, Icon, Range, Divider } from '@hellonexus/ui';

const WMO: Record<number, [string, string]> = {
  0: ['Clear', 'sun'], 1: ['Mainly clear', 'sun'], 2: ['Partly cloudy', 'cloud-sun'],
  3: ['Overcast', 'cloud'], 45: ['Fog', 'cloud-fog'], 48: ['Fog', 'cloud-fog'],
  51: ['Drizzle', 'cloud-drizzle'], 53: ['Drizzle', 'cloud-drizzle'], 55: ['Drizzle', 'cloud-drizzle'],
  56: ['Drizzle', 'cloud-drizzle'], 57: ['Drizzle', 'cloud-drizzle'],
  61: ['Rain', 'cloud-rain'], 63: ['Rain', 'cloud-rain'], 65: ['Heavy rain', 'cloud-rain'],
  66: ['Rain', 'cloud-rain'], 67: ['Rain', 'cloud-rain'],
  71: ['Snow', 'cloud-snow'], 73: ['Snow', 'cloud-snow'], 75: ['Heavy snow', 'cloud-snow'],
  77: ['Snow grains', 'cloud-snow'], 80: ['Rain showers', 'cloud-rain-wind'],
  81: ['Rain showers', 'cloud-rain-wind'], 82: ['Heavy showers', 'cloud-rain-wind'],
  85: ['Snow showers', 'cloud-snow'], 86: ['Snow showers', 'cloud-snow'],
  95: ['Thunderstorm', 'cloud-lightning'], 96: ['Thunderstorm', 'cloud-lightning'], 99: ['Thunderstorm', 'cloud-lightning'],
};
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FAHRENHEIT = new Set(['US', 'BS', 'BZ', 'KY', 'LR', 'PW', 'FM', 'MH']);
const codeMeta = (c: number): [string, string] => WMO[c] ?? ['Unknown', 'help-circle'];

function hourLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  return `${h % 12 || 12}${h >= 12 ? 'PM' : 'AM'}`;
}
function dayLabel(iso: string, i: number) {
  if (i === 0) return 'Today';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso.slice(5) : (DAY_LABELS[d.getDay()] ?? iso.slice(5));
}

interface WeatherSettings {
  autoDetect?: boolean; latitude?: number | null; longitude?: number | null;
  label?: string; units?: string;
  showCondition?: boolean; showLocation?: boolean; showDetails?: boolean;
}
interface OMResponse {
  current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number; relative_humidity_2m?: number };
  hourly?: { time?: string[]; temperature_2m?: number[]; weather_code?: number[] };
  daily?: { time?: string[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; weather_code?: number[] };
}
interface IpWho {
  success?: boolean; latitude?: number; longitude?: number;
  city?: string; region?: string; country?: string; country_code?: string;
}
interface Loc { lat: number; lon: number; label: string; countryCode: string | null }
interface Hour { hourLabel: string; icon: string; tempLabel: string }
interface Day { dayLabel: string; icon: string; lo: number; hi: number; loLabel: string; hiLabel: string }
interface Weather {
  current: { tempLabel: string; condition: string; icon: string; humidityLabel: string; windLabel: string; hiLoLabel: string; label: string };
  hourly: Hour[]; daily: Day[]; weekMin: number; weekMax: number;
}

function manualLoc(s: WeatherSettings): Loc | null {
  if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') return null;
  return { lat: s.latitude, lon: s.longitude, label: s.label?.trim() || 'Manual', countryCode: null };
}

function parse(body: OMResponse | null, label: string): Weather | null {
  if (!body || typeof body !== 'object') return null;
  const cur = body.current ?? {};
  const [condition, icon] = codeMeta(typeof cur.weather_code === 'number' ? cur.weather_code : 0);
  const cutoff = Date.now() - 3600_000;
  const hourly: Hour[] = [];
  const ht = body.hourly?.time ?? [];
  for (let i = 0; i < ht.length && hourly.length < 6; i++) {
    if (new Date(ht[i]).getTime() < cutoff) continue;
    const raw = body.hourly?.temperature_2m?.[i];
    if (typeof raw !== 'number') continue;
    hourly.push({ hourLabel: hourLabel(ht[i]), icon: codeMeta(body.hourly?.weather_code?.[i] ?? 0)[1], tempLabel: `${Math.round(raw)}°` });
  }
  const dt = body.daily?.time ?? [];
  const daily: Day[] = [];
  for (let i = 0; i < dt.length && daily.length < 5; i++) {
    const rawLo = body.daily?.temperature_2m_min?.[i];
    const rawHi = body.daily?.temperature_2m_max?.[i];
    if (typeof rawLo !== 'number' || typeof rawHi !== 'number') continue;
    const lo = Math.round(rawLo); const hi = Math.round(rawHi);
    daily.push({ dayLabel: dayLabel(dt[i], i), icon: codeMeta(body.daily?.weather_code?.[i] ?? 0)[1], lo, hi, loLabel: `${lo}°`, hiLabel: `${hi}°` });
  }
  const weekMin = daily.length ? Math.min(...daily.map((x) => x.lo)) : 0;
  const weekMax = daily.length ? Math.max(...daily.map((x) => x.hi)) : 1;
  const temp = typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) : null;
  const humidity = typeof cur.relative_humidity_2m === 'number' ? Math.round(cur.relative_humidity_2m) : null;
  const wind = typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : null;
  const today = daily[0];
  return {
    current: {
      tempLabel: temp !== null ? `${temp}°` : '…', condition, icon,
      humidityLabel: humidity !== null ? `${humidity}%` : '', windLabel: wind !== null ? `${wind}` : '',
      hiLoLabel: today ? `H:${today.hi}° L:${today.lo}°` : '', label,
    },
    hourly, daily, weekMin, weekMax,
  };
}

function useWeather(s: WeatherSettings): { data: Weather | null; empty: string | null } {
  const [data, setData] = useState<Weather | null>(null);
  const [empty, setEmpty] = useState<string | null>(null);
  const geo = useRef<Loc | null>(null);
  const key = `${s.autoDetect === false ? 'manual' : 'auto'}|${s.latitude ?? ''}|${s.longitude ?? ''}|${s.label ?? ''}|${s.units ?? ''}`;

  useEffect(() => {
    let alive = true;
    geo.current = null; // location-relevant settings changed
    const resolveLoc = async (): Promise<Loc | null> => {
      if (s.autoDetect === false) return manualLoc(s);
      if (geo.current) return geo.current;
      try {
        const res = await request('https://ipwho.is/');
        const b = (res.ok ? await res.json() : null) as IpWho | null;
        if (b && b.success !== false && typeof b.latitude === 'number' && typeof b.longitude === 'number') {
          geo.current = { lat: b.latitude, lon: b.longitude, label: b.city || b.region || b.country || 'Detected', countryCode: b.country_code ?? null };
          return geo.current;
        }
      } catch { /* fall through */ }
      return manualLoc(s);
    };
    const run = async () => {
      const loc = await resolveLoc();
      if (!alive) return;
      if (!loc) { setEmpty(s.autoDetect === false ? 'Enter latitude and longitude in settings.' : 'Auto-detect failed. Set manual coords.'); return; }
      const unit = s.units === 'fahrenheit' ? 'fahrenheit'
        : s.units === 'celsius' ? 'celsius'
        : (loc.countryCode && FAHRENHEIT.has(loc.countryCode.toUpperCase()) ? 'fahrenheit' : 'celsius');
      const params = new URLSearchParams({
        latitude: String(loc.lat), longitude: String(loc.lon),
        current: 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m',
        hourly: 'temperature_2m,weather_code', daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        forecast_days: '5', forecast_hours: '12', timezone: 'auto', temperature_unit: unit, wind_speed_unit: 'kmh',
      });
      try {
        const res = await request(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!res.ok) return;
        const parsed = parse(await res.json(), loc.label);
        if (alive && parsed) { setData(parsed); setEmpty(null); }
      } catch { /* keep last */ }
    };
    void run();
    const handle = setInterval(run, 600_000);
    return () => { alive = false; clearInterval(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, empty };
}

function Details({ d, size }: { d: Weather; size: number }) {
  return (
    <Stack direction="row" gap={8} align="center">
      <Icon name="droplet" size={size} tone="text-dim" />
      <Text value={d.current.humidityLabel} size={size - 1} opacity={0.58} />
      <Icon name="wind" size={size} tone="text-dim" />
      <Text value={d.current.windLabel} size={size - 1} opacity={0.58} />
    </Stack>
  );
}

function HourlyStrip({ d }: { d: Weather }) {
  return (
    <Stack direction="row" gap={3} align="center" justify="between">
      {d.hourly.map((h, i) => (
        <Stack key={i} direction="column" gap={5} align="center">
          <Text value={h.hourLabel} size={11} opacity={0.48} />
          <Icon name={h.icon} size={22} tone="accent-glow" />
          <Text value={h.tempLabel} size={11} />
        </Stack>
      ))}
    </Stack>
  );
}

function Weather() {
  const s = useSettings<WeatherSettings>();
  const { data, empty } = useWeather(s);
  const { width, height } = useSize();
  const layout = useMemo<'sm' | 'wide' | 'full'>(() => {
    if (height >= 300) return 'full';
    if (width >= 300) return 'wide';
    return 'sm';
  }, [width, height]);

  if (!data) {
    return (
      <Stack direction="column" padding={14} gap={6} align="center" justify="center" grow>
        <Icon name="cloud-sun" size={32} tone="text-dim" />
        <Text value={empty ?? 'Loading…'} size={12} tone="text-faded" align="center" />
      </Stack>
    );
  }
  const c = data.current;

  if (layout === 'sm') {
    return (
      <Stack direction="column" padding={12} gap={5} align="stretch" justify="center" grow>
        <Stack direction="row" gap={10} align="center">
          <Icon name={c.icon} size={54} tone="accent-glow" />
          <Stack direction="column" gap={4} justify="center">
            <Text value={c.tempLabel} size={38} weight="bold" />
            {s.showDetails !== false && <Details d={data} size={10} />}
          </Stack>
        </Stack>
        {s.showCondition !== false && <Text value={c.condition} size={12} align="center" opacity={0.7} truncate />}
        {s.showLocation !== false && <Text value={c.label} size={11} align="center" opacity={0.4} truncate />}
      </Stack>
    );
  }

  const Header = (
    <Stack direction="row" gap={14} align="start" justify="between">
      <Stack direction="column" gap={5}>
        <Text value={c.tempLabel} size={layout === 'full' ? 56 : 50} weight="bold" />
        {s.showDetails !== false && <Details d={data} size={12} />}
      </Stack>
      <Stack direction="column" gap={3} align="end">
        <Stack direction="row" gap={6} align="center" justify="end">
          <Icon name={c.icon} size={24} tone="accent-glow" />
          {s.showCondition !== false && <Text value={c.condition} size={12} align="end" opacity={0.72} truncate />}
        </Stack>
        <Text value={c.hiLoLabel} size={12} align="end" opacity={0.55} />
        {s.showLocation !== false && <Text value={c.label} size={11} align="end" opacity={0.42} truncate />}
      </Stack>
    </Stack>
  );

  if (layout === 'wide') {
    return (
      <Stack direction="column" padding={14} gap={15} align="stretch" justify="center" grow>
        {Header}
        <HourlyStrip d={data} />
      </Stack>
    );
  }

  return (
    <Stack direction="column" padding={18} gap={12} align="stretch" grow>
      {Header}
      <HourlyStrip d={data} />
      <Divider />
      <Stack direction="column" gap={6} grow justify="between">
        {data.daily.map((day, i) => (
          <Stack key={i} direction="row" gap={9} align="center">
            <Text value={day.dayLabel} size={12} />
            <Icon name={day.icon} size={21} tone="accent-glow" />
            <Text value={day.loLabel} size={12} opacity={0.45} />
            <Range lo={day.lo} hi={day.hi} min={data.weekMin} max={data.weekMax} gradient="temp" glow height={5} />
            <Text value={day.hiLabel} size={12} />
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

mount(Weather);

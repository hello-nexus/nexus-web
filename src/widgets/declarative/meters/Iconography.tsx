import type { CSSProperties } from 'react';
import {
  Cpu, Fan, Lightbulb, Monitor, Activity, Cloud, CloudRain, CloudSun, Sun,
  CloudFog, CloudDrizzle, CloudSnow, CloudRainWind, CloudLightning, HelpCircle,
  Droplet, Wind, Snowflake, Zap, Music, Volume2, Battery, Wifi, Hash, Clock,
  ThermometerSun, AlertTriangle, CheckCircle2, Info, Power, TrendingUp,
  TrendingDown, ArrowUpRight, ArrowDownRight, BarChart3, Newspaper, Coins,
  Play, Pause, Square, RotateCcw, ChevronUp, ChevronDown, Plus, AppWindow,
  type LucideIcon,
} from 'lucide-react';
import type { WidgetView } from '../../types';
import { bind, bindColor, bindNumber, type RenderContext } from '../renderer';

interface MeterProps { view: WidgetView; ctx: RenderContext; }

const ICON_TABLE: Record<string, LucideIcon> = {
  cpu: Cpu,
  fan: Fan,
  lightbulb: Lightbulb,
  monitor: Monitor,
  activity: Activity,
  cloud: Cloud,
  'cloud-rain': CloudRain,
  'cloud-rain-wind': CloudRainWind,
  'cloud-sun': CloudSun,
  'cloud-fog': CloudFog,
  'cloud-drizzle': CloudDrizzle,
  'cloud-snow': CloudSnow,
  'cloud-lightning': CloudLightning,
  'help-circle': HelpCircle,
  droplet: Droplet,
  wind: Wind,
  sun: Sun,
  snowflake: Snowflake,
  zap: Zap,
  music: Music,
  volume: Volume2,
  battery: Battery,
  wifi: Wifi,
  hash: Hash,
  clock: Clock,
  thermometer: ThermometerSun,
  warning: AlertTriangle,
  check: CheckCircle2,
  info: Info,
  power: Power,
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'arrow-up-right': ArrowUpRight,
  'arrow-down-right': ArrowDownRight,
  chart: BarChart3,
  news: Newspaper,
  coins: Coins,
  play: Play,
  pause: Pause,
  square: Square,
  'rotate-ccw': RotateCcw,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  plus: Plus,
  'app-window': AppWindow,
};

export function Icon({ view, ctx }: MeterProps) {
  const name = String(bind(view.name, ctx, '') ?? '');
  const size = bindNumber(view.size, ctx, 18);
  const color = bindColor(view.color, ctx, 'currentColor');
  const Icn = ICON_TABLE[name.toLowerCase()];
  if (!Icn) return null;
  return <Icn size={size} color={color} aria-hidden="true" />;
}

export function ImageMeter({ view, ctx }: MeterProps) {
  const src = String(bind(view.src, ctx, '') ?? '');
  const alt = String(bind(view.alt, ctx, '') ?? '');
  const fit = (bind(view.fit, ctx) as string) ?? 'contain';
  if (!src) return null;
  const resolved = resolveAssetUrl(src, ctx.widgetId);
  const style: CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: fit as CSSProperties['objectFit'],
  };
  return <img src={resolved} alt={alt} style={style} />;
}

function resolveAssetUrl(src: string, widgetId: string): string {
  if (/^(https?:|data:|blob:|\/)/.test(src)) return src;
  // Bundle-relative asset: served via /widgets-api/installed/{id}/asset/...
  return `/widgets-api/installed/${encodeURIComponent(widgetId)}/asset/${src}`;
}

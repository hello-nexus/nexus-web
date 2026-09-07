// Host icon table for the SDK `ui-icon` element. Mirrors the native
// lucide name map so SDK widgets render the identical glyphs as native ones.

import {
  Cpu, Fan, Lightbulb, Monitor, Activity, Cloud, CloudRain, CloudSun, Sun,
  CloudFog, CloudDrizzle, CloudSnow, CloudRainWind, CloudLightning, HelpCircle,
  Droplet, Wind, Snowflake, Zap, Music, Volume2, Battery, Wifi, Hash, Clock,
  ThermometerSun, AlertTriangle, CheckCircle2, Info, Power, TrendingUp,
  TrendingDown, ArrowUpRight, ArrowDownRight, BarChart3, Newspaper, Coins,
  Play, Pause, Square, RotateCcw, ChevronUp, ChevronDown, Plus, Minus, AppWindow,
  SkipBack, SkipForward, Film, X, Radio, Sticker, ZoomIn, ExternalLink, Trash2, Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react';

export const ICON_TABLE: Record<string, LucideIcon> = {
  cpu: Cpu, fan: Fan, lightbulb: Lightbulb, monitor: Monitor, activity: Activity,
  cloud: Cloud, 'cloud-rain': CloudRain, 'cloud-rain-wind': CloudRainWind,
  'cloud-sun': CloudSun, 'cloud-fog': CloudFog, 'cloud-drizzle': CloudDrizzle,
  'cloud-snow': CloudSnow, 'cloud-lightning': CloudLightning, 'help-circle': HelpCircle,
  droplet: Droplet, wind: Wind, sun: Sun, snowflake: Snowflake, zap: Zap, music: Music,
  volume: Volume2, battery: Battery, wifi: Wifi, hash: Hash, clock: Clock,
  thermometer: ThermometerSun, warning: AlertTriangle, check: CheckCircle2, info: Info,
  power: Power, 'trending-up': TrendingUp, 'trending-down': TrendingDown,
  'arrow-up-right': ArrowUpRight, 'arrow-down-right': ArrowDownRight, chart: BarChart3,
  news: Newspaper, coins: Coins, play: Play, pause: Pause, square: Square,
  'rotate-ccw': RotateCcw, 'chevron-up': ChevronUp, 'chevron-down': ChevronDown,
  plus: Plus, minus: Minus, 'app-window': AppWindow,
  'skip-back': SkipBack, 'skip-forward': SkipForward, film: Film,
  x: X, radio: Radio, sticker: Sticker, 'zoom-in': ZoomIn, 'external-link': ExternalLink,
  trash: Trash2, image: ImageIcon,
};

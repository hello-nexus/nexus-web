import { Film, Monitor, Palette, Power, Sparkles, type LucideIcon } from 'lucide-react';
import type { LightingMode } from '../types/lighting';

export const LIGHTING_MODE_ICONS: Record<LightingMode, LucideIcon> = {
  animate: Sparkles,
  gif: Film,
  screen: Monitor,
  static: Palette,
  none: Power,
};

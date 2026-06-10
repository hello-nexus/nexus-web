import { type ReactNode } from 'react';
import {
  Activity, BarChart, LayoutDashboard, Lightbulb, Fan, Settings,
  Usb, Wrench, Gauge, Users, LampCeiling,
} from 'lucide-react';

export const ICON_SIZE = 18;

// Builder / Benchmark / Community sidebar entries are hidden; routes still
// resolve so bookmarked URLs keep working. Typed instead of `[] as const`
// so consumers see the element union rather than `never`.
export const PORTAL_NAV_KEYS: readonly ('builder' | 'benchmark' | 'community')[] = [];

export const NAV_ICONS: Record<string, ReactNode> = {
  dashboard:  <LayoutDashboard size={ICON_SIZE} />,
  monitoring: <Activity size={ICON_SIZE} />,
  screentime: <BarChart size={ICON_SIZE} />,
  lighting:   <Lightbulb size={ICON_SIZE} />,
  'smart-lights': <LampCeiling size={ICON_SIZE} />,
  cooling:    <Fan size={ICON_SIZE} />,
  devices:    <Usb size={ICON_SIZE} />,
  settings:   <Settings size={ICON_SIZE} />,
  builder:    <Wrench size={ICON_SIZE} />,
  benchmark:  <Gauge size={ICON_SIZE} />,
  community:  <Users size={ICON_SIZE} />,
};

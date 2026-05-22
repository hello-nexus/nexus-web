import { type ReactNode } from 'react';
import {
  Activity, LayoutDashboard, Lightbulb, Fan, Settings,
  Bug, Usb, Wrench, Gauge, Users,
} from 'lucide-react';

export const ICON_SIZE = 18;

// The five pinnable apps (dashboard + monitoring/lighting/cooling/devices)
// now live in `./sidebarApps`, since the sidebar builds its rows from the
// user's pinned order rather than this hardcoded list.

// Builder / Benchmark / Community sidebar entries are hidden for now; routes
// still resolve so anyone with a bookmarked URL keeps working. Typed instead
// of `[] as const` so downstream consumers see the original element union
// rather than `never`.
export const PORTAL_NAV_KEYS: readonly ('builder' | 'benchmark' | 'community')[] = [];

export const NAV_ICONS: Record<string, ReactNode> = {
  dashboard:  <LayoutDashboard size={ICON_SIZE} />,
  monitoring: <Activity size={ICON_SIZE} />,
  lighting:   <Lightbulb size={ICON_SIZE} />,
  cooling:    <Fan size={ICON_SIZE} />,
  devices:    <Usb size={ICON_SIZE} />,
  settings:   <Settings size={ICON_SIZE} />,
  tools:      <Bug size={ICON_SIZE} />,
  builder:    <Wrench size={ICON_SIZE} />,
  benchmark:  <Gauge size={ICON_SIZE} />,
  community:  <Users size={ICON_SIZE} />,
};

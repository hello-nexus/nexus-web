import { type ReactNode } from 'react';
import {
  Activity, LayoutDashboard, Lightbulb, Fan, Settings,
  Bug, Usb, Wrench, Gauge, Users,
} from 'lucide-react';

export const ICON_SIZE = 18;

export const SERVICE_NAV_KEYS = [
  'dashboard', 'monitoring', 'lighting', 'cooling', 'devices', 'settings',
] as const;

export const PORTAL_NAV_KEYS = ['builder', 'benchmark', 'community'] as const;

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

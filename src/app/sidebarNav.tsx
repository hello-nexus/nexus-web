import { type ReactNode } from 'react';
import {
  Activity, LayoutDashboard, Lightbulb, Fan, Settings,
  Usb, Gauge, LampCeiling, House, Stethoscope, Film,
} from 'lucide-react';
import { ScreenTimeIcon } from '../panel/widgets/screentime/screentimeIcon';

export const ICON_SIZE = 18;

// The Benchmark sidebar entry is hidden until the portal launches. Typed
// instead of `[] as const` so consumers see the element union rather than
// `never`.
export const PORTAL_NAV_KEYS: readonly 'benchmark'[] = [];

// Views (within the 'system' section) that can enter Focus mode - full
// window width, top-bar chrome stripped to the window controls + the Focus
// toggle. Extend this set as more pages opt in.
export const FOCUS_CAPABLE_VIEWS: ReadonlySet<string> = new Set(['monitoring']);

export const NAV_ICONS: Record<string, ReactNode> = {
  dashboard:  <LayoutDashboard size={ICON_SIZE} />,
  monitoring: <Activity size={ICON_SIZE} />,
  screentime: <ScreenTimeIcon size={ICON_SIZE} />,
  frames:     <Film size={ICON_SIZE} />,
  lighting:   <Lightbulb size={ICON_SIZE} />,
  'smart-lights': <LampCeiling size={ICON_SIZE} />,
  'home-assistant': <House size={ICON_SIZE} />,
  cooling:    <Fan size={ICON_SIZE} />,
  devices:    <Usb size={ICON_SIZE} />,
  diagnostics: <Stethoscope size={ICON_SIZE} />,
  settings:   <Settings size={ICON_SIZE} />,
  benchmark:  <Gauge size={ICON_SIZE} />,
};

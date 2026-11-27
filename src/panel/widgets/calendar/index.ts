import { lazy } from 'react';
import { CalendarDays } from 'lucide-react';
import type { AppManifest } from '../types';
import { CalendarWidget } from './CalendarWidget';
import { CalendarSettings } from './CalendarSettings';
import { CalendarImmersive } from './CalendarImmersive';

// Code-split: the dashboard page loads only when navigated to, so the panel bundle never fetches it.
const CalendarPage = lazy(() => import('./page/CalendarPage').then(m => ({ default: m.CalendarPage })));

export const calendarApp: AppManifest = {
  meta: {
    type: 'calendar',
    i18nKey: 'panel.widget.calendar',
    icon: CalendarDays,
    sizes: ['2x2', '2x4', '4x2', '4x4', '2x2round'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    // A newly added widget is the date card: no grid, no events.
    defaultConfig: () => ({ showGrid: false, showEvents: false }),
    desktopOnlyHintKey: 'panel.widget.calendar.desktopOnlyHint',
    touch: false,
  },
  Widget: CalendarWidget,
  Page: CalendarPage,
  Touch: CalendarImmersive,
  Settings: CalendarSettings,
};

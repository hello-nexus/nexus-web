import { CalendarDays } from 'lucide-react';
import type { AppManifest } from '../types';
import { CalendarWidget } from './CalendarWidget';
import { CalendarSettings } from './CalendarSettings';
import { makeWidgetTouchView } from '../common/WidgetTouchView';

export const calendarApp: AppManifest = {
  meta: {
    type: 'calendar',
    i18nKey: 'panel.widget.calendar',
    icon: CalendarDays,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '4x2',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: false,
  },
  Widget: CalendarWidget,
  Touch: makeWidgetTouchView(CalendarWidget),
  Settings: CalendarSettings,
};

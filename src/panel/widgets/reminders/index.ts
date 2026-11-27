import { lazy } from 'react';
import { ListChecks } from 'lucide-react';
import type { AppManifest } from '../types';
import { RemindersWidget } from './RemindersWidget';
import { RemindersSettings } from './RemindersSettings';
import { RemindersImmersive } from './RemindersImmersive';
import { DEFAULT_SELECTION_KEY } from './reminderLogic';

// Code-split: the dashboard page loads only when navigated to, so the panel bundle never fetches it.
const RemindersPage = lazy(() => import('./page/RemindersPage').then(m => ({ default: m.RemindersPage })));

export const remindersApp: AppManifest = {
  meta: {
    type: 'reminders',
    i18nKey: 'panel.widget.reminders',
    icon: ListChecks,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '2x4',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    // A newly added widget lists today's reminders.
    defaultConfig: () => ({ viewMode: 'list', list: DEFAULT_SELECTION_KEY, showCompleted: false }),
    desktopOnlyHintKey: 'reminders.desktopOnlyHint',
    touch: false,
  },
  Widget: RemindersWidget,
  Page: RemindersPage,
  Touch: RemindersImmersive,
  Settings: RemindersSettings,
};

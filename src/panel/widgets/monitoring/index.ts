import { lazy } from 'react';
import { Activity } from 'lucide-react';
import type { AppManifest } from '../types';
import { MonitoringWidget } from './MonitoringWidget';
import { MonitoringTouch } from './MonitoringTouch';
import { MonitoringSettings } from './MonitoringSettings';

// Code-split: Page only loads when the dashboard navigates into the
// immersive view. Widget + Touch stay eager so panel cells render
// synchronously and the panel bundle never fetches Page bytes at all.
const MonitoringPage = lazy(() => import('./MonitoringPage').then(m => ({ default: m.MonitoringPage })));

export const monitoringApp: AppManifest = {
  meta: {
    type: 'monitoring',
    i18nKey: 'panel.widget.monitoring',
    icon: Activity,
    sizes: ['2x2', '2x4', '4x2', '4x4'],
    defaultSize: '4x4',
    pickerSize: '4x2',
    supportsImmersive: { portrait: true, landscape: true },
    hasConfig: true,
    touch: false,
  },
  Widget: MonitoringWidget,
  Page: MonitoringPage,
  Touch: MonitoringTouch,
  Settings: MonitoringSettings,
  resolveInitialSelection: ({ point, widget }) => {
    // MonitoringWidget stamps `data-monitoring-slot-index` on each slot
    // div/button (multi-slot layouts only; micro layouts have no per-slot
    // selection). We can't use elementFromPoint here because the context
    // menu is still mounted on top of the press point — it would shadow
    // the bottom-row slots whenever the menu opens upward. Query the
    // widget's slots directly and hit-test by bounding rect instead.
    if (typeof document === 'undefined') return undefined;
    const widgetEl = document.querySelector<HTMLElement>(
      `[data-panel-widget-id="${widget.id}"]`,
    );
    if (!widgetEl) return undefined;
    const slots = widgetEl.querySelectorAll<HTMLElement>('[data-monitoring-slot-index]');
    for (const slot of slots) {
      const r = slot.getBoundingClientRect();
      if (point.x >= r.left && point.x <= r.right
          && point.y >= r.top && point.y <= r.bottom) {
        const parsed = Number.parseInt(slot.dataset.monitoringSlotIndex ?? '', 10);
        if (Number.isFinite(parsed)) return { selectedSlot: parsed };
      }
    }
    return undefined;
  },
};

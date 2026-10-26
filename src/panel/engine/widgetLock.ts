import type { PanelLayout } from '../types';

/** Sets one widget's lock; an unlocked widget stores no flag. */
export function setWidgetLocked(layout: PanelLayout, widgetId: string, locked: boolean): PanelLayout {
  return mapWidgets(layout, w => (w.id === widgetId ? withLock(w, locked) : w));
}

/** Locks or unlocks every widget on every page. */
export function setAllWidgetsLocked(layout: PanelLayout, locked: boolean): PanelLayout {
  return mapWidgets(layout, w => withLock(w, locked));
}

function withLock<T extends { locked?: boolean }>(widget: T, locked: boolean): T {
  if (Boolean(widget.locked) === locked) return widget;
  if (locked) return { ...widget, locked: true };
  const { locked: _unused, ...rest } = widget;
  return rest as T;
}

function mapWidgets(layout: PanelLayout, fn: (w: PanelLayout['pages'][number]['widgets'][number]) => PanelLayout['pages'][number]['widgets'][number]): PanelLayout {
  let changed = false;
  const pages = layout.pages.map(page => {
    const widgets = page.widgets.map(w => {
      const next = fn(w);
      if (next !== w) changed = true;
      return next;
    });
    return widgets.some((w, i) => w !== page.widgets[i]) ? { ...page, widgets } : page;
  });
  return changed ? { ...layout, pages } : layout;
}

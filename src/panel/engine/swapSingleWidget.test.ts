import { describe, expect, it } from 'vitest';
import { swapSingleWidget } from './panelLayoutOps';
import type { PanelLayout, PanelWidget } from '../types';

function widget(id: string, type: string, config?: PanelWidget['config']): PanelWidget {
  return { id, type, size: '2x4', col: 0, row: 0, config };
}

function layout(active: PanelWidget | null, singleWidgetConfigs?: PanelLayout['singleWidgetConfigs']): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'q60',
    pages: [{ id: 'p1', widgets: active ? [active] : [] }],
    singleWidgetConfigs,
  };
}

describe('swapSingleWidget', () => {
  it('stashes the outgoing widget config and shows the incoming type fresh', () => {
    const before = layout(widget('a', 'clock', { format: '24h' }));
    const after = swapSingleWidget(before, widget('b', 'media'));

    // The shown widget is now media, with no remembered config.
    expect(after.pages[0].widgets.map(w => w.type)).toEqual(['media']);
    expect(after.pages[0].widgets[0].config).toBeUndefined();
    // The clock's config is remembered under its type.
    expect(after.singleWidgetConfigs).toEqual({ clock: { format: '24h' } });
  });

  it('restores a previously-configured type on switch-back', () => {
    // clock was configured, then swapped away (remembered), media is active.
    const before = layout(widget('b', 'media', { source: 'spotify' }), { clock: { format: '24h' } });
    const after = swapSingleWidget(before, widget('c', 'clock'));

    expect(after.pages[0].widgets[0].type).toBe('clock');
    // clock's remembered config is restored...
    expect(after.pages[0].widgets[0].config).toEqual({ format: '24h' });
    // ...and media's current config is now remembered for its next return.
    expect(after.singleWidgetConfigs).toEqual({
      clock: { format: '24h' },
      media: { source: 'spotify' },
    });
  });

  it('records an empty config for an outgoing widget that was never configured', () => {
    const before = layout(widget('a', 'clock'));
    const after = swapSingleWidget(before, widget('b', 'media'));
    expect(after.singleWidgetConfigs).toEqual({ clock: {} });
  });

  it('keeps the layout single-widget (one page, one widget) and preserves other fields', () => {
    const before = layout(widget('a', 'clock', { format: '24h' }));
    const after = swapSingleWidget(before, widget('b', 'media'));
    expect(after.pages).toHaveLength(1);
    expect(after.pages[0].widgets).toHaveLength(1);
    expect(after.surface).toBe('q60');
    expect(after.layoutSchemaVersion).toBe(2);
  });

  it('handles an empty layout (no current widget) by just showing the incoming type', () => {
    const before = layout(null);
    const after = swapSingleWidget(before, widget('b', 'media'));
    expect(after.pages[0].widgets.map(w => w.type)).toEqual(['media']);
    expect(after.singleWidgetConfigs ?? {}).toEqual({});
  });
});

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  canMarkImmersiveOnLoad,
  immersiveOnLoadResolvable,
  immersiveOnLoadTarget,
  isImmersiveOnLoadWidget,
  resolveImmersiveOnLoadWidget,
  setImmersiveOnLoadWidgetId,
  surfaceSupportsImmersiveOnLoad,
  widgetSupportsImmersiveOnLoad,
} from './immersiveOnLoad';
import type { PanelLayout, PanelWidget } from '../types';
import { _resetMarketplaceRegistryForTests, hasMarketplaceLoadedOnce, loadMarketplaceApps } from '../../widgets/marketplaceRegistry';
import { listInstalledApps } from '../../widgets/api';

vi.mock('../../widgets/api', () => ({ listInstalledApps: vi.fn() }));
const mockList = vi.mocked(listInstalledApps);

function widget(id: string, type: string): PanelWidget {
  return { id, type, size: '2x2', col: 0, row: 0 };
}

function layout(pages: PanelWidget[][], immersiveOnLoadWidgetId?: string): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'y70',
    pages: pages.map((widgets, i) => ({ id: `p${i + 1}`, widgets })),
    immersiveOnLoadWidgetId,
  };
}

describe('surfaceSupportsImmersiveOnLoad', () => {
  it('accepts the touch panel surfaces', () => {
    expect(surfaceSupportsImmersiveOnLoad('y70')).toBe(true);
    expect(surfaceSupportsImmersiveOnLoad('phone')).toBe(true);
  });

  it('accepts a promoted monitor only when it has a touch digitizer', () => {
    expect(surfaceSupportsImmersiveOnLoad('monitor', true)).toBe(true);
    expect(surfaceSupportsImmersiveOnLoad('monitor', false)).toBe(false);
  });

  it('rejects single-widget glass and the embedded dashboard', () => {
    // No dashboard to skip on one-widget glass, and no pointer to swipe out with.
    expect(surfaceSupportsImmersiveOnLoad('q60')).toBe(false);
    expect(surfaceSupportsImmersiveOnLoad('kraken')).toBe(false);
    expect(surfaceSupportsImmersiveOnLoad('lcd-round')).toBe(false);
    expect(surfaceSupportsImmersiveOnLoad('desktop')).toBe(false);
  });
});

describe('widgetSupportsImmersiveOnLoad', () => {
  it('follows the widget meta per orientation', () => {
    // media declares immersive in both orientations; snake is portrait-only.
    expect(widgetSupportsImmersiveOnLoad('media', false)).toBe(true);
    expect(widgetSupportsImmersiveOnLoad('media', true)).toBe(true);
    expect(widgetSupportsImmersiveOnLoad('snake', false)).toBe(true);
    expect(widgetSupportsImmersiveOnLoad('snake', true)).toBe(false);
  });

  it('rejects a widget with no immersive view and an unknown type', () => {
    expect(widgetSupportsImmersiveOnLoad('timer', false)).toBe(false);
    expect(widgetSupportsImmersiveOnLoad('does-not-exist', false)).toBe(false);
  });
});

describe('resolveImmersiveOnLoadWidget', () => {
  it('returns the marked first-page widget', () => {
    const l = layout([[widget('a', 'media'), widget('b', 'clock')]], 'a');
    expect(resolveImmersiveOnLoadWidget(l)?.id).toBe('a');
    expect(isImmersiveOnLoadWidget(l, 'a')).toBe(true);
    expect(isImmersiveOnLoadWidget(l, 'b')).toBe(false);
  });

  it('is inert for a mark on a widget that is not on the first page', () => {
    const l = layout([[widget('a', 'media')], [widget('b', 'media')]], 'b');
    expect(resolveImmersiveOnLoadWidget(l)).toBeNull();
    expect(isImmersiveOnLoadWidget(l, 'b')).toBe(false);
  });

  it('is null with no mark and for a mark naming no widget', () => {
    expect(resolveImmersiveOnLoadWidget(layout([[widget('a', 'media')]]))).toBeNull();
    expect(resolveImmersiveOnLoadWidget(layout([[widget('a', 'media')]], 'gone'))).toBeNull();
  });
});

describe('setImmersiveOnLoadWidgetId', () => {
  it('replaces the previous mark, so only one widget can ever carry it', () => {
    const l = layout([[widget('a', 'media'), widget('b', 'media')]], 'a');
    expect(setImmersiveOnLoadWidgetId(l, 'b').immersiveOnLoadWidgetId).toBe('b');
  });

  it('clears on null', () => {
    const l = layout([[widget('a', 'media')]], 'a');
    expect(setImmersiveOnLoadWidgetId(l, null).immersiveOnLoadWidgetId).toBeUndefined();
  });

  it('clears rather than store an id that is not on the first page', () => {
    const l = layout([[widget('a', 'media')], [widget('b', 'media')]], 'a');
    expect(setImmersiveOnLoadWidgetId(l, 'b').immersiveOnLoadWidgetId).toBeUndefined();
  });

  it('returns the same layout when nothing changes', () => {
    const l = layout([[widget('a', 'media')]], 'a');
    expect(setImmersiveOnLoadWidgetId(l, 'a')).toBe(l);
    expect(setImmersiveOnLoadWidgetId(layout([[widget('a', 'media')]]), null))
      .toEqual(layout([[widget('a', 'media')]]));
  });
});

describe('canMarkImmersiveOnLoad', () => {
  it('offers the mark for a first-page widget with an immersive view', () => {
    const l = layout([[widget('a', 'media')]]);
    expect(canMarkImmersiveOnLoad(l, l.pages[0].widgets[0], 'y70', false)).toBe(true);
  });

  it('withholds it for a widget on a later page', () => {
    const l = layout([[widget('a', 'media')], [widget('b', 'media')]]);
    expect(canMarkImmersiveOnLoad(l, l.pages[1].widgets[0], 'y70', false)).toBe(false);
  });

  it('withholds it for a widget with no immersive view in this orientation', () => {
    const l = layout([[widget('a', 'snake'), widget('b', 'timer')]]);
    expect(canMarkImmersiveOnLoad(l, l.pages[0].widgets[0], 'y70', false)).toBe(true);
    expect(canMarkImmersiveOnLoad(l, l.pages[0].widgets[0], 'y70', true)).toBe(false);
    expect(canMarkImmersiveOnLoad(l, l.pages[0].widgets[1], 'y70', false)).toBe(false);
  });

  it('withholds it on a surface with no immersive mode, and with no widget', () => {
    const l = layout([[widget('a', 'media')]]);
    expect(canMarkImmersiveOnLoad(l, l.pages[0].widgets[0], 'q60', false)).toBe(false);
    expect(canMarkImmersiveOnLoad(l, null, 'y70', false)).toBe(false);
  });
});

describe('immersiveOnLoadTarget', () => {
  it('returns the marked widget', () => {
    const target = immersiveOnLoadTarget({
      layout: layout([[widget('a', 'media')]], 'a'),
      surface: 'y70',
      landscape: false,
    });
    expect(target?.id).toBe('a');
  });

  it('returns null with no mark', () => {
    expect(immersiveOnLoadTarget({
      layout: layout([[widget('a', 'media')]]),
      surface: 'y70',
      landscape: false,
    })).toBeNull();
  });

  it('returns null when the mark sits on a later page', () => {
    expect(immersiveOnLoadTarget({
      layout: layout([[widget('a', 'media')], [widget('b', 'media')]], 'b'),
      surface: 'y70',
      landscape: false,
    })).toBeNull();
  });

  it('returns null when the panel has turned to an orientation the widget has no immersive view for', () => {
    const l = layout([[widget('a', 'snake')]], 'a');
    expect(immersiveOnLoadTarget({ layout: l, surface: 'y70', landscape: false })?.id).toBe('a');
    expect(immersiveOnLoadTarget({ layout: l, surface: 'y70', landscape: true })).toBeNull();
  });

  it('returns null on a surface with no immersive mode', () => {
    expect(immersiveOnLoadTarget({
      layout: layout([[widget('a', 'media')]], 'a'),
      surface: 'monitor',
      landscape: false,
      deviceTouch: false,
    })).toBeNull();
  });
});

describe('immersiveOnLoadResolvable', () => {
  beforeEach(() => _resetMarketplaceRegistryForTests());
  afterEach(() => _resetMarketplaceRegistryForTests());

  it('is true with no mark and for a built-in widget type', () => {
    expect(immersiveOnLoadResolvable(layout([[widget('a', 'media')]]))).toBe(true);
    expect(immersiveOnLoadResolvable(layout([[widget('a', 'media')]], 'a'))).toBe(true);
  });

  it('is false for a marked SDK app until the registry has loaded', () => {
    // lookupApp reports no immersive view for an unresolved app:<id>, which is
    // indistinguishable from a widget that has none - so the caller must wait
    // rather than burn its one-shot open.
    const l = layout([[widget('a', 'app:com.hellonexus.aquarium')]], 'a');
    expect(immersiveOnLoadResolvable(l)).toBe(false);
  });

  it('is true for a marked SDK app once the registry has loaded', async () => {
    mockList.mockResolvedValue([]);
    await loadMarketplaceApps();
    expect(hasMarketplaceLoadedOnce(), 'the load must have succeeded, or this asserts nothing').toBe(true);
    const l = layout([[widget('a', 'app:com.hellonexus.aquarium')]], 'a');
    expect(immersiveOnLoadResolvable(l)).toBe(true);
  });
});

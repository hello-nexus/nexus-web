// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { widgetInputOf } from '../types';
import { APP_REGISTRY, appAvailableForSurface, makeMarketplaceAppManifest, sizesForSurface } from '../widgets/registry';

describe('legacy desktop widgets on a display panel', () => {
  it('renders every type the desktop could show on a display-bound monitor, touch or not', () => {
    const gaps: string[] = [];
    for (const [type, app] of Object.entries(APP_REGISTRY)) {
      if (!appAvailableForSurface(app.meta, 'desktop')) continue;
      // A display-bound panel hands the registry a mouse (widgetInputOf).
      const touch = widgetInputOf(false, true);
      const ok = appAvailableForSurface(app.meta, 'monitor', { deviceTouch: touch, displayBound: true })
        && sizesForSurface(app.meta, 'monitor', touch).length > 0;
      if (!ok) gaps.push(type);
    }
    expect(gaps).toEqual([]);
  });

  it('keeps a desktop-only SDK app on a monitor', () => {
    const meta = makeMarketplaceAppManifest('com.example.x', 'X', ['2x2'], '2x2', false, '', false, false, ['desktop']).meta;
    expect(appAvailableForSurface(meta, 'monitor', { deviceTouch: widgetInputOf(false, true), displayBound: true })).toBe(true);
    expect(appAvailableForSurface(meta, 'lcd-round', { displayBound: true })).toBe(false);
    // A monitor panel with no display behind it (D213, Lian Li LCD) keeps the origin/main rule.
    expect(appAvailableForSurface(meta, 'monitor', { deviceTouch: false })).toBe(false);
    expect(appAvailableForSurface(meta, 'monitor', { deviceTouch: true, displayBound: false })).toBe(false);
  });

  it('leaves a non-display monitor catalog as it was: only widgets that already fit a monitor', () => {
    for (const app of Object.values(APP_REGISTRY)) {
      const before = !app.meta.surfaces || app.meta.surfaces.includes('monitor');
      const now = appAvailableForSurface(app.meta, 'monitor', { deviceTouch: false });
      if (now) expect(before).toBe(true);
    }
  });
});

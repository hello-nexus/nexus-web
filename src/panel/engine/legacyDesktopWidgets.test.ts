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
      const ok = appAvailableForSurface(app.meta, 'monitor', { deviceTouch: touch })
        && sizesForSurface(app.meta, 'monitor', touch).length > 0;
      if (!ok) gaps.push(type);
    }
    expect(gaps).toEqual([]);
  });

  it('keeps a desktop-only SDK app on a monitor', () => {
    const meta = makeMarketplaceAppManifest('com.example.x', 'X', ['2x2'], '2x2', false, '', false, false, ['desktop']).meta;
    expect(appAvailableForSurface(meta, 'monitor', { deviceTouch: widgetInputOf(false, true) })).toBe(true);
    expect(appAvailableForSurface(meta, 'lcd-round')).toBe(false);
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appRouteForWidget } from './panelLayoutHelpers';
import { APP_REGISTRY } from '../widgets/registry';

const VIEWS_WITH_A_CASE = new Set([
  'dashboard', 'monitoring', 'screentime', 'benchmark', 'lighting', 'smart-lights', 'home-assistant', 'cooling',
  'devices', 'diagnostics', 'frames', 'store', 'build', 'clock', 'weather', 'steam', 'gallery', 'settings',
]);
// Same character rule as the service's OpenAppRoute.Normalize.
const SAFE_ROUTE = /^\/system\/[A-Za-z0-9/\-_.~?=]{1,192}$/;

describe('appRouteForWidget', () => {
  it('opens the widget\'s own page when it has one', () => {
    expect(appRouteForWidget({ id: 'w', type: 'monitoring' })).toBe('/system/monitoring');
    expect(appRouteForWidget({ id: 'w', type: 'lighting' })).toBe('/system/lighting');
  });

  it('has no route for a widget with no page or editor', () => {
    expect(appRouteForWidget({ id: 'w', type: 'no-such-widget' })).toBeNull();
    expect(appRouteForWidget({ id: 'w', type: 'stopwatch' })).toBeNull();
    expect(appRouteForWidget({ id: 'deck-1', type: 'deck' })).toBeNull();
  });

  it('opens the panel editor at the deck, and at the tapped key when known', () => {
    expect(appRouteForWidget({ id: 'deck-1', type: 'deck' }, 'rec1')).toBe('/system/panel/rec1?widget=deck-1');
    expect(appRouteForWidget({ id: 'deck-1', type: 'deck' }, 'rec1', { page: 1, folderPath: [2, 0], slot: 5 }))
      .toBe('/system/panel/rec1?widget=deck-1~1~2.0~5');
  });

  it('opens the Displays page for the displays widget', () => {
    expect(appRouteForWidget({ id: 'w', type: 'displays' })).toBe('/system/devices/displays');
  });

  it('routes every registered widget with a route to a view the dashboard renders, within the open-app character rule', () => {
    for (const type of Object.keys(APP_REGISTRY)) {
      const route = appRouteForWidget({ id: '0a1b2c3d-0000-4000-8000-000000000000', type }, 'UWrndEqWfnJI', { page: 0, folderPath: [], slot: 3 });
      if (route === null) continue;
      expect(route, type).toMatch(SAFE_ROUTE);
      const view = route.split('?')[0].split('/')[2];
      expect(view === 'panel' || VIEWS_WITH_A_CASE.has(view), `${type} -> ${route}`).toBe(true);
    }
  });
});

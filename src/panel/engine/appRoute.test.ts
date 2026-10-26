// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appRouteForWidget } from './panelLayoutHelpers';

describe('appRouteForWidget', () => {
  it('opens the widget\'s own page when it has one', () => {
    expect(appRouteForWidget('monitoring')).toBe('/system/monitoring');
    expect(appRouteForWidget('lighting')).toBe('/system/lighting');
  });

  it('falls back to the dashboard for a widget with no page', () => {
    expect(appRouteForWidget('no-such-widget')).toBe('/system/dashboard');
  });
});

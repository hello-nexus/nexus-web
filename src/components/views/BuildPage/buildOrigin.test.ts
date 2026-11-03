import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ devTools: true }));
vi.mock('../../../lib/devTools', () => ({ get DEV_TOOLS() { return h.devTools; } }));

import { BUILD_ORIGIN_OVERRIDE_KEY, PRODUCTION_BUILD_ORIGIN, resolveBuildOrigin } from './buildOrigin';

describe('resolveBuildOrigin', () => {
  afterEach(() => { localStorage.clear(); h.devTools = true; });

  it('frames the site unless a dev-tools build stores another http(s) origin', () => {
    expect(resolveBuildOrigin()).toBe(PRODUCTION_BUILD_ORIGIN);
    localStorage.setItem(BUILD_ORIGIN_OVERRIDE_KEY, 'http://192.168.1.50:5173/builder?x=1');
    expect(resolveBuildOrigin()).toBe('http://192.168.1.50:5173');
  });

  it('ignores a value that is not an http(s) URL', () => {
    localStorage.setItem(BUILD_ORIGIN_OVERRIDE_KEY, 'javascript:alert(1)');
    expect(resolveBuildOrigin()).toBe(PRODUCTION_BUILD_ORIGIN);
    localStorage.setItem(BUILD_ORIGIN_OVERRIDE_KEY, 'not a url');
    expect(resolveBuildOrigin()).toBe(PRODUCTION_BUILD_ORIGIN);
  });

  it('never reads the override in a release build', () => {
    h.devTools = false;
    localStorage.setItem(BUILD_ORIGIN_OVERRIDE_KEY, 'http://192.168.1.50:5173');
    expect(resolveBuildOrigin()).toBe(PRODUCTION_BUILD_ORIGIN);
  });
});

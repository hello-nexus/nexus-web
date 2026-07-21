import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRoute } from './useRoute';

describe('useRoute', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('canonicalizes the landing page to the dashboard', () => {
    const { result } = renderHook(() => useRoute());

    expect(result.current.section).toBe('system');
    expect(result.current.view).toBe('dashboard');
    expect(result.current.subtab).toBeNull();
    expect(window.location.pathname).toBe('/system/dashboard');
  });

  it('keeps dashboard as the system default route', () => {
    window.history.replaceState(null, '', '/system');

    const { result } = renderHook(() => useRoute());

    expect(result.current.view).toBe('dashboard');
    expect(result.current.subtab).toBeNull();
    expect(window.location.pathname).toBe('/system/dashboard');
  });

  it('does not rewrite user navigation from monitoring to cooling', () => {
    const { result } = renderHook(() => useRoute());

    act(() => {
      result.current.setView('cooling');
    });

    expect(result.current.view).toBe('cooling');
    expect(result.current.subtab).toBeNull();
    expect(window.location.pathname).toBe('/system/cooling');
  });

  it('preserves explicit monitoring subtabs', () => {
    window.history.replaceState(null, '', '/system/monitoring/cpu');

    const { result } = renderHook(() => useRoute());

    expect(result.current.view).toBe('monitoring');
    expect(result.current.subtab).toBe('cpu');
    expect(window.location.pathname).toBe('/system/monitoring/cpu');
  });

  it('defaults settings to the general subtab', () => {
    window.history.replaceState(null, '', '/system/settings');

    const { result } = renderHook(() => useRoute());

    expect(result.current.view).toBe('settings');
    expect(result.current.subtab).toBe('general');
    expect(window.location.pathname).toBe('/system/settings/general');
  });

  it('preserves explicit settings subtabs', () => {
    window.history.replaceState(null, '', '/system/settings/advanced');

    const { result } = renderHook(() => useRoute());

    expect(result.current.view).toBe('settings');
    expect(result.current.subtab).toBe('advanced');
    expect(window.location.pathname).toBe('/system/settings/advanced');
  });
});

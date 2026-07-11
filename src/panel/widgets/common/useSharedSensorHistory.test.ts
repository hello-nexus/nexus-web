import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSharedSensorHistory } from './useSharedSensorHistory';
import { getPanelSensorHist } from '../../../lib/monitoringStore';

describe('useSharedSensorHistory', () => {
  it('pushes a sample into the shared store when enabled (default)', () => {
    const key = 'test::enabled-default';
    renderHook(() => useSharedSensorHistory(key, 42));
    expect(getPanelSensorHist(key)).toEqual([42]);
  });

  it('pushes a sample when enabled is explicitly true', () => {
    const key = 'test::enabled-true';
    renderHook(() => useSharedSensorHistory(key, 7, true));
    expect(getPanelSensorHist(key)).toEqual([7]);
  });

  it('never pushes into the shared store when disabled (preview-safety: a preview mount must not corrupt a live widget sharing the same key)', () => {
    const key = 'test::enabled-false';
    renderHook(() => useSharedSensorHistory(key, 99, false));
    expect(getPanelSensorHist(key)).toEqual([]);
  });

  it('resumes pushing once toggled from disabled to enabled', () => {
    const key = 'test::toggle';
    const { rerender } = renderHook(({ enabled }) => useSharedSensorHistory(key, 5, enabled), {
      initialProps: { enabled: false },
    });
    expect(getPanelSensorHist(key)).toEqual([]);
    rerender({ enabled: true });
    expect(getPanelSensorHist(key)).toEqual([5]);
  });
});

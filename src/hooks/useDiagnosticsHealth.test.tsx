import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDiagnosticsHealth } from './useDiagnosticsHealth';

const h = vi.hoisted(() => ({
  prefsCb: null as null | ((data: unknown) => void),
  fetchDiagnosticsHealth: vi.fn(),
}));

vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, cb: (data: unknown) => void) => {
    if (topic === 'prefs' && enabled) h.prefsCb = cb;
  },
}));
vi.mock('../api/diagnostics', async (orig) => ({
  ...(await orig<typeof import('../api/diagnostics')>()),
  fetchDiagnosticsHealth: h.fetchDiagnosticsHealth,
}));

function Consumer() {
  useDiagnosticsHealth(true);
  return null;
}

afterEach(() => {
  vi.clearAllMocks();
  h.prefsCb = null;
});

describe('useDiagnosticsHealth', () => {
  it('refetches when the prefs topic fires, so an Ignore / Include shows without waiting for the poll', async () => {
    h.fetchDiagnosticsHealth.mockResolvedValue({ data: null, mocked: false });
    await act(async () => { render(<Consumer />); });
    expect(h.fetchDiagnosticsHealth).toHaveBeenCalledTimes(1);

    await act(async () => { h.prefsCb!({}); });
    expect(h.fetchDiagnosticsHealth).toHaveBeenCalledTimes(2);
  });
});

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FanChannel } from '../../../../api/cooling';
import { CoolingCase3D } from './CoolingCase3D';
import { createCaseRenderer } from './coolingCaseRenderer';

const h = vi.hoisted(() => ({
  temps: { cpu: null as number | null, gpu: null as number | null },
  setup: { record: null as unknown, loaded: true },
  layout: { layout: { directions: {}, bindings: [], tests: [] }, settled: true, failed: false, edit: () => {} },
  renderers: [] as { setState: ReturnType<typeof vi.fn>; setTemps: ReturnType<typeof vi.fn>; setAnchors: ReturnType<typeof vi.fn> }[],
}));

vi.mock('../../../../hooks/useComponentTemps', () => ({ useComponentTemps: () => h.temps }));
vi.mock('../../../../hooks/usePcSetupRecord', () => ({ usePcSetupRecord: () => h.setup }));
vi.mock('../../../../hooks/useCaseModel', () => ({ useCaseModel: () => ({ bytes: null, settled: true }) }));
vi.mock('../../../../hooks/useCoolingLayout', () => ({ useCoolingLayout: () => h.layout }));
vi.mock('./coolingCaseRenderer', () => ({
  createCaseRenderer: vi.fn(() => {
    const r = { setState: vi.fn(), setTemps: vi.fn(), setAnchors: vi.fn(), resize: vi.fn(), dispose: vi.fn(), flowSupported: true };
    h.renderers.push(r);
    return r;
  }),
}));

const record = {
  rev: 1,
  setup: {
    version: 1, case: {}, items: [],
    resolved: {
      objects: [],
      caseLayout: {
        size: [450, 230, 470],
        boxes: [
          { slot: 'gpu', role: 'part', min: [100, 20, 60], size: [300, 40, 120] },
          { slot: 'cooler', role: 'part', min: [300, 80, 150], size: [100, 100, 100] },
        ],
        fanSlots: [{ key: 'front:120:0', position: 'front', size: 120, index: 0, taken: 'fan', box: { min: [0, 10, 10], size: [25, 120, 120] }, axis: [1, 0, 0] }],
      },
    },
  },
};
const channels = [{ id: 'fan-a', name: 'Fan A', rpm: 1500, dutyPercent: 100, maxRpm: 1500 }] as FanChannel[];
const ui = () => <CoolingCase3D channels={channels} selectedChannelId={null} onSelectChannel={vi.fn()} />;

beforeEach(() => {
  h.setup = { record, loaded: true };
  h.temps = { cpu: null, gpu: null };
  h.renderers.length = 0;
  vi.mocked(createCaseRenderer).mockClear();
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
});

describe('CoolingCase3D component temperatures', () => {
  it('labels each component that has a reading, and hides the one that has none', () => {
    h.temps = { cpu: null, gpu: 71.6 };
    render(ui());
    expect(screen.getByTestId('temp-label-gpu').textContent).toContain('72');
    expect(screen.queryByTestId('temp-label-cpu')).toBeNull();
  });

  it('shows both labels when both sensors read', () => {
    h.temps = { cpu: 55, gpu: 60 };
    render(ui());
    expect(screen.getByTestId('temp-label-cpu').textContent).toContain('55');
    expect(screen.getByTestId('temp-label-gpu').textContent).toContain('60');
  });

  it('sends a temperature change to the same renderer without rebuilding it or restating the scene', () => {
    h.temps = { cpu: 50, gpu: 60 };
    const { rerender } = render(ui());
    const r = h.renderers[0];
    const states = r.setState.mock.calls.length;
    expect(r.setTemps).toHaveBeenLastCalledWith({ cpu: 50, gpu: 60 });
    h.temps = { cpu: 52, gpu: 63 };
    rerender(ui());
    expect(vi.mocked(createCaseRenderer)).toHaveBeenCalledTimes(1);
    expect(r.setTemps).toHaveBeenLastCalledWith({ cpu: 52, gpu: 63 });
    expect(r.setState.mock.calls.length).toBe(states);
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FanChannel } from '../../../../api/cooling';
import type { CoolingLayout } from '../../../../api/coolingLayout';
import { CoolingCase3D } from './CoolingCase3D';
import { createCaseRenderer, type PickHandler } from './coolingCaseRenderer';

const h = vi.hoisted(() => ({
  flowSupported: true,
  model: { bytes: null as ArrayBuffer | null, settled: true },
  setup: { record: null as unknown, loaded: false },
  layout: { layout: { directions: {}, bindings: [], tests: [] } as unknown, settled: false, failed: false, edit: vi.fn() },
  pick: { current: null as null | ((key: string | null, x: number, y: number) => void) },
  renderers: [] as { setState: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; flowSupported: boolean }[],
}));

vi.mock('../../../../hooks/usePcSetupRecord', () => ({ usePcSetupRecord: () => h.setup }));
vi.mock('../../../../hooks/useCaseModel', () => ({ useCaseModel: () => h.model }));
vi.mock('../../../../hooks/useCoolingLayout', () => ({ useCoolingLayout: () => h.layout }));
vi.mock('./coolingCaseRenderer', () => ({
  createCaseRenderer: vi.fn((_canvas: HTMLCanvasElement, onPick: PickHandler) => {
    h.pick.current = onPick;
    const r = { setState: vi.fn(), resize: vi.fn(), dispose: vi.fn(), get flowSupported() { return h.flowSupported; } };
    h.renderers.push(r);
    return r;
  }),
}));

const caseLayout = () => ({
  size: [450, 230, 470],
  boxes: [],
  fanSlots: [
    { key: 'front:120:0', position: 'front', size: 120, index: 0, taken: 'fan', box: { min: [0, 10, 10], size: [25, 120, 120] }, axis: [1, 0, 0] },
    { key: 'rear:120:0', position: 'rear', size: 120, index: 0, taken: 'fan', box: { min: [425, 10, 10], size: [25, 120, 120] }, axis: [-1, 0, 0] },
  ],
});
const record = (rev = 1, empty = false) => {
  const layout = caseLayout();
  if (empty) layout.fanSlots = layout.fanSlots.map(s => ({ ...s, taken: null as never }));
  return { rev, setup: { version: 1, case: {}, items: [], resolved: { objects: [], caseLayout: layout } } };
};
const channels = [{ id: 'fan-a', name: 'Fan A', rpm: 1500, dutyPercent: 100, maxRpm: 1500 }, { id: 'fan-b', name: 'Fan B', rpm: 1500, dutyPercent: 100, maxRpm: 1500 }] as FanChannel[];

function setLayout(patch: Partial<typeof h.layout>) {
  h.layout = { ...h.layout, ...patch };
}

const ui = (selected: string | null = null, onSelect = vi.fn()) => (
  <CoolingCase3D channels={channels} selectedChannelId={selected} onSelectChannel={onSelect} />
);

const lastState = () => h.renderers[h.renderers.length - 1].setState.mock.calls.at(-1)?.[0];

beforeEach(() => {
  h.setup = { record: null, loaded: false };
  h.layout = { layout: { directions: {}, bindings: [], tests: [] }, settled: false, failed: false, edit: vi.fn() };
  h.renderers.length = 0;
  h.flowSupported = true;
  h.model = { bytes: null, settled: true };
  vi.mocked(createCaseRenderer).mockClear();
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
});

describe('CoolingCase3D renderer lifecycle', () => {
  it('draws when the setup answers before the cooling layout', () => {
    h.setup = { record: record(), loaded: true };
    const { rerender } = render(ui());
    expect(createCaseRenderer).not.toHaveBeenCalled();
    setLayout({ settled: true });
    rerender(ui());
    expect(createCaseRenderer).toHaveBeenCalledTimes(1);
    expect(lastState().layout.fanSlots).toHaveLength(2);
  });

  it('draws when the cooling layout answers before the setup', () => {
    setLayout({ settled: true });
    const { rerender } = render(ui());
    expect(createCaseRenderer).not.toHaveBeenCalled();
    h.setup = { record: record(), loaded: true };
    rerender(ui());
    expect(createCaseRenderer).toHaveBeenCalledTimes(1);
    expect(lastState().directions).toEqual({ 'front:120:0': 'intake', 'rear:120:0': 'exhaust' });
  });

  it('still draws the case with default directions and a notice when the layout fails', () => {
    h.setup = { record: record(), loaded: true };
    setLayout({ settled: true, failed: true });
    render(ui());
    expect(createCaseRenderer).toHaveBeenCalledTimes(1);
    expect(screen.getByText('cooling.case3d.layoutError')).toBeTruthy();
    expect(lastState().directions['rear:120:0']).toBe('exhaust');
  });

  it('keeps one renderer when a setup ping changes nothing it draws', () => {
    h.setup = { record: record(1), loaded: true };
    setLayout({ settled: true });
    const { rerender } = render(ui());
    const first = lastState().layout;
    h.setup = { record: record(2), loaded: true };
    rerender(ui());
    expect(createCaseRenderer).toHaveBeenCalledTimes(1);
    expect(h.renderers[0].dispose).not.toHaveBeenCalled();
    expect(lastState().layout).toBe(first);
  });

  it('updates the scene in place when a direction changes', () => {
    h.setup = { record: record(), loaded: true };
    setLayout({ settled: true });
    const { rerender } = render(ui());
    setLayout({ layout: { directions: { 'front:120:0': 'exhaust' }, bindings: [], tests: [] } });
    rerender(ui());
    expect(createCaseRenderer).toHaveBeenCalledTimes(1);
    expect(lastState().directions['front:120:0']).toBe('exhaust');
  });

  it('disposes one renderer per mount across 20 view toggles', () => {
    h.setup = { record: record(), loaded: true };
    setLayout({ settled: true });
    for (let i = 0; i < 20; i++) render(ui()).unmount();
    expect(createCaseRenderer).toHaveBeenCalledTimes(20);
    expect(h.renderers.every(r => r.dispose.mock.calls.length === 1)).toBe(true);
  });

  it('shows the empty state with no case layout', () => {
    h.setup = { record: { rev: 1, setup: { resolved: { objects: [] }, items: [] } }, loaded: true };
    setLayout({ settled: true });
    render(ui());
    expect(screen.getByText('cooling.case3d.empty.title')).toBeTruthy();
    expect(createCaseRenderer).not.toHaveBeenCalled();
  });
});

describe('CoolingCase3D device dropdown', () => {
  const mountReady = (selected: string | null, bindings: CoolingLayout['bindings'] = [], onSelect = vi.fn()) => {
    h.setup = { record: record(), loaded: true };
    setLayout({ settled: true, layout: { directions: {}, bindings, tests: [] } });
    render(ui(selected, onSelect));
    return onSelect;
  };
  const open = () => {
    act(() => h.pick.current?.('front:120:0', 10, 10));
    fireEvent.click(screen.getByRole('button', { name: 'cooling.case3d.device.label' }));
  };
  const mutate = () => h.layout.edit.mock.calls.at(-1)![0] as (l: CoolingLayout) => CoolingLayout;
  const base = (bindings: CoolingLayout['bindings']): CoolingLayout => ({ directions: {}, bindings, tests: [] });

  it('titles an unlinked fan by its position and a linked one by the device name', () => {
    mountReady(null);
    act(() => h.pick.current?.('front:120:0', 10, 10));
    expect(screen.getByRole('dialog').textContent).toContain('cooling.case3d.position.front');
  });

  it('titles a linked fan by the device name from the left-hand list', () => {
    mountReady(null, [{ channelId: 'fan-b', slotKeys: ['front:120:0'] }]);
    act(() => h.pick.current?.('front:120:0', 10, 10));
    expect(screen.getByRole('dialog').textContent).toContain('Fan B');
  });

  it('lists every device by its name, with a no-fan-linked entry first', () => {
    mountReady(null);
    open();
    const names = screen.getAllByRole('option').map(o => o.textContent);
    expect(names[0]).toContain('cooling.case3d.noneLinked');
    expect(names.join('|')).toContain('Fan A');
    expect(names.join('|')).toContain('Fan B');
  });

  it('links the chosen device to this fan at once', () => {
    mountReady(null);
    open();
    fireEvent.click(screen.getByRole('option', { name: /Fan A/ }));
    expect(mutate()(base([])).bindings).toEqual([{ channelId: 'fan-a', slotKeys: ['front:120:0'] }]);
  });

  it('replaces the device this fan had', () => {
    mountReady(null, [{ channelId: 'fan-a', slotKeys: ['front:120:0'] }]);
    open();
    fireEvent.click(screen.getByRole('option', { name: /Fan B/ }));
    expect(mutate()(base([{ channelId: 'fan-a', slotKeys: ['front:120:0'] }])).bindings).toEqual([{ channelId: 'fan-b', slotKeys: ['front:120:0'] }]);
  });

  it('unlinks with the no-fan-linked entry', () => {
    mountReady(null, [{ channelId: 'fan-a', slotKeys: ['front:120:0'] }]);
    open();
    fireEvent.click(screen.getByRole('option', { name: /cooling\.case3d\.noneLinked/ }));
    expect(mutate()(base([{ channelId: 'fan-a', slotKeys: ['front:120:0'] }])).bindings).toEqual([]);
  });

  it('marks a device already on another fan and moves it here, off the old fan', () => {
    mountReady(null, [{ channelId: 'fan-b', slotKeys: ['rear:120:0'] }]);
    open();
    const entry = screen.getByRole('option', { name: /Fan B/ });
    expect(entry.textContent).toContain('cooling.case3d.linkedToOne');
    fireEvent.click(entry);
    expect(mutate()(base([{ channelId: 'fan-b', slotKeys: ['rear:120:0'] }])).bindings).toEqual([{ channelId: 'fan-b', slotKeys: ['front:120:0'] }]);
  });

  it('moves a channel that held several fans to this one alone', () => {
    mountReady(null, [{ channelId: 'fan-b', slotKeys: ['rear:120:0', 'front:120:0'] }]);
    open();
    fireEvent.click(screen.getByRole('option', { name: /Fan B/ }));
    expect(mutate()(base([{ channelId: 'fan-b', slotKeys: ['rear:120:0', 'front:120:0'] }])).bindings).toEqual([{ channelId: 'fan-b', slotKeys: ['front:120:0'] }]);
  });

  it('selects the device of a linked fan in the list and opens the fan\'s controls, without editing anything', () => {
    const onSelect = mountReady(null, [{ channelId: 'fan-b', slotKeys: ['rear:120:0'] }]);
    act(() => h.pick.current?.('rear:120:0', 10, 10));
    expect(onSelect).toHaveBeenCalledWith('fan-b');
    expect(h.layout.edit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('CoolingCase3D airflow controls', () => {
  const mountReady = () => {
    h.setup = { record: record(), loaded: true };
    setLayout({ settled: true });
    return render(ui());
  };

  it('passes the flow input with every fan cfm and the default options: particles on, dead zones and solids off', () => {
    mountReady();
    const state = lastState();
    expect(state.flow.layout.fanSlots).toHaveLength(2);
    expect(Object.keys(state.flow.fanCfm).sort()).toEqual(['front:120:0', 'rear:120:0']);
    expect(state.flow.fanCfm['front:120:0']).toBeGreaterThan(0);
    expect(state.flowOptions).toEqual({ particles: true, deadZones: false, collisions: false, speed: 1.5 });
  });

  it('keeps the flow input when a setup ping changes nothing it reads', () => {
    h.setup = { record: record(1), loaded: true };
    setLayout({ settled: true });
    const { rerender } = render(ui());
    const first = lastState().flow;
    h.setup = { record: record(2), loaded: true };
    rerender(ui());
    expect(lastState().flow).toBe(first);
  });

  it('sends a new flow input when a direction changes', () => {
    h.setup = { record: record(), loaded: true };
    setLayout({ settled: true });
    const { rerender } = render(ui());
    const first = lastState().flow;
    setLayout({ layout: { directions: { 'front:120:0': 'exhaust' }, bindings: [], tests: [] } });
    rerender(ui());
    expect(lastState().flow).not.toBe(first);
    expect(lastState().flow.directions['front:120:0']).toBe('exhaust');
  });

  it('toggles particles and dead zones', () => {
    mountReady();
    fireEvent.click(screen.getByRole('switch', { name: 'cooling.case3d.flow.deadZones' }));
    expect(lastState().flowOptions.deadZones).toBe(true);
    expect(screen.getByText('cooling.case3d.flow.deadZonesHint')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'cooling.case3d.flow.particles' }));
    expect(lastState().flowOptions.particles).toBe(false);
  });

  it('labels the legend cooler and warmer, with no degrees', () => {
    mountReady();
    expect(screen.getByText('cooling.case3d.flow.cooler')).toBeTruthy();
    expect(screen.getByText('cooling.case3d.flow.warmer')).toBeTruthy();
  });

  it('says so when the graphics setup cannot run the simulation', () => {
    h.flowSupported = false;
    mountReady();
    expect(screen.getByText('cooling.case3d.flow.unsupported')).toBeTruthy();
    expect(screen.queryByText('cooling.case3d.flow.cooler')).toBeNull();
  });
});

describe('CoolingCase3D slots bound to a cooling device', () => {
  const mountEmpty = (bindings: CoolingLayout['bindings']) => {
    h.setup = { record: record(1, true), loaded: true };
    setLayout({ settled: true, layout: { directions: {}, bindings, tests: [] } });
    return render(ui());
  };

  it('treats a bound empty slot as an installed fan: drawn, in the flow input, and no no-fans note', () => {
    mountEmpty([{ channelId: 'fan-a', slotKeys: ['front:120:0'] }]);
    const state = lastState();
    expect(state.layout.fanSlots.find((s: { key: string }) => s.key === 'front:120:0').taken).toBe('fan');
    expect(state.layout.fanSlots.find((s: { key: string }) => s.key === 'rear:120:0').taken).toBeNull();
    expect(state.flow.fanCfm['front:120:0']).toBeGreaterThan(0);
    expect(Object.keys(state.flow.fanCfm)).toEqual(['front:120:0']);
    expect(screen.queryByText('cooling.case3d.noFans')).toBeNull();
  });

  it('shows the no-fans note when no slot is taken or bound, and again once the last binding goes', () => {
    const { rerender } = mountEmpty([{ channelId: 'fan-a', slotKeys: ['front:120:0'] }]);
    expect(screen.queryByText('cooling.case3d.noFans')).toBeNull();
    setLayout({ layout: { directions: {}, bindings: [], tests: [] } });
    rerender(ui());
    expect(screen.getByText('cooling.case3d.noFans')).toBeTruthy();
    expect(lastState().flow).toBeNull();
  });

  it('ignores a binding to a device that is not in the list', () => {
    mountEmpty([{ channelId: 'gone', slotKeys: ['front:120:0'] }]);
    expect(screen.getByText('cooling.case3d.noFans')).toBeTruthy();
  });
});

describe('CoolingCase3D overlapping mounts', () => {
  it('draws one fan for a 120 and a 140 mm slot at the same mount and links without adding one', () => {
    const layout = {
      size: [470, 320, 487],
      boxes: [],
      fanSlots: [
        { key: 'top:120:1', position: 'top', size: 120, index: 1, taken: null, box: { min: [193, 450, 58], size: [120, 25, 120] }, axis: [0, -1, 0] },
        { key: 'top:140:0', position: 'top', size: 140, index: 0, taken: null, box: { min: [170, 450, 48], size: [140, 25, 140] }, axis: [0, -1, 0] },
      ],
    };
    h.setup = { record: { rev: 1, setup: { version: 1, case: {}, items: [], resolved: { objects: [], caseLayout: layout } } }, loaded: true };
    setLayout({ settled: true, layout: { directions: {}, bindings: [{ channelId: 'fan-a', slotKeys: ['top:120:1'] }, { channelId: 'fan-b', slotKeys: ['top:140:0'] }], tests: [] } });
    render(ui());
    const state = lastState();
    expect(state.layout.fanSlots).toHaveLength(1);
    expect(state.layout.fanSlots[0].taken).toBe('fan');
    expect(Object.keys(state.flow.fanCfm)).toHaveLength(1);
    expect([...state.bound]).toEqual([state.layout.fanSlots[0].key]);
  });
});

describe('CoolingCase3D live fan speed', () => {
  const rpmChannels = (rpmA: number) => [{ id: 'fan-a', name: 'Fan A', rpm: rpmA, dutyPercent: 50, maxRpm: 1500 }, { id: 'fan-b', name: 'Fan B', rpm: 1500, dutyPercent: 100, maxRpm: 1500 }] as FanChannel[];
  const mount = (rpm: number, bindings: CoolingLayout['bindings']) => {
    h.setup = { record: record(), loaded: true };
    setLayout({ settled: true, layout: { directions: {}, bindings, tests: [] } });
    return render(<CoolingCase3D channels={rpmChannels(rpm)} selectedChannelId={null} onSelectChannel={vi.fn()} />);
  };

  it('runs a bound fan at its live share and leaves an unbound one rated', () => {
    mount(750, [{ channelId: 'fan-a', slotKeys: ['front:120:0'] }]);
    const cfm = lastState().flow.fanCfm as Record<string, number>;
    expect(cfm['front:120:0']).toBeLessThan(cfm['rear:120:0'] * 0.8);
  });

  it('gives a stopped bound fan no flow', () => {
    mount(0, [{ channelId: 'fan-a', slotKeys: ['front:120:0'] }]);
    const cfm = lastState().flow.fanCfm as Record<string, number>;
    expect(cfm['front:120:0']).toBe(0);
    expect(cfm['rear:120:0']).toBeGreaterThan(0);
    expect(screen.queryByText('cooling.case3d.noFans')).toBeNull();
  });

  it('gives a simulated fan and a real channel at the same rpm with no top speed identical flow', () => {
    const real = [{ id: 'real', name: 'Real', rpm: 500, dutyPercent: 20 }] as FanChannel[];
    h.setup = { record: record(), loaded: true };
    setLayout({ settled: true, layout: { directions: {}, bindings: [{ channelId: 'real', slotKeys: ['front:120:0'] }], tests: [] } });
    const first = render(<CoolingCase3D channels={real} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    const realFlow = lastState().flow;
    first.unmount();
    setLayout({ settled: true, layout: { directions: {}, bindings: [{ channelId: 'sim:500', slotKeys: ['front:120:0'] }], tests: [] } });
    render(<CoolingCase3D channels={[]} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    const simFlow = lastState().flow;
    expect(simFlow.fanCfm['front:120:0']).toBeGreaterThan(0);
    expect(simFlow.fanCfm).toEqual(realFlow.fanCfm);
    expect(simFlow.ventCfm).toBe(realFlow.ventCfm);
    expect(simFlow.referenceCfm).toBe(realFlow.referenceCfm);
  });

  it('moves the flow with a simulated speed without restarting the renderer or the layout', () => {
    h.setup = { record: record(), loaded: true };
    const slider = (id: string) => ({ settled: true, layout: { directions: {}, bindings: [{ channelId: id, slotKeys: ['front:120:0'] }], tests: [] } });
    setLayout(slider('sim:500'));
    const { rerender } = render(<CoolingCase3D channels={[]} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    const low = lastState();
    setLayout(slider('sim:2500'));
    rerender(<CoolingCase3D channels={[]} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    const high = lastState();
    expect(vi.mocked(createCaseRenderer)).toHaveBeenCalledTimes(1);
    expect(high.layout).toEqual(low.layout);
    expect(high.flow.fanCfm['front:120:0']).toBeGreaterThan(low.flow.fanCfm['front:120:0']);
  });

  it('does not send a new flow input for tach jitter, but does for a real speed change', () => {
    const bindings = [{ channelId: 'fan-a', slotKeys: ['front:120:0'] }];
    h.setup = { record: record(), loaded: true };
    setLayout({ settled: true, layout: { directions: {}, bindings, tests: [] } });
    const { rerender } = render(<CoolingCase3D channels={rpmChannels(1000)} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    const first = lastState().flow;
    rerender(<CoolingCase3D channels={rpmChannels(1015)} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    expect(lastState().flow).toBe(first);
    rerender(<CoolingCase3D channels={rpmChannels(500)} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    expect(lastState().flow).not.toBe(first);
  });
});

describe('CoolingCase3D case model', () => {
  const mount = () => {
    h.setup = { record: record(), loaded: true };
    setLayout({ settled: true });
    return render(ui());
  };

  it('hands Build\'s exported model to the scene and shows no hint', () => {
    const bytes = new ArrayBuffer(8);
    h.model = { bytes, settled: true };
    mount();
    expect(lastState().model).toBe(bytes);
    expect(screen.queryByText('cooling.case3d.noModel')).toBeNull();
  });

  it('keeps the outline and says to open Build once when the service holds no model', () => {
    mount();
    expect(lastState().model).toBeNull();
    expect(screen.getByText('cooling.case3d.noModel')).toBeTruthy();
  });

  it('shows no hint while the model is still being asked for', () => {
    h.model = { bytes: null, settled: false };
    mount();
    expect(screen.queryByText('cooling.case3d.noModel')).toBeNull();
  });
});

describe('CoolingCase3D idle re-solves', () => {
  const chans = (rpm: [number, number, number]) => [
    { id: 'fan-a', name: 'Fan A', rpm: rpm[0], dutyPercent: 30, maxRpm: 1500 },
    { id: 'fan-b', name: 'Fan B', rpm: rpm[1], dutyPercent: 30, maxRpm: 1500 },
    { id: 'fan-c', name: 'Fan C', rpm: rpm[2], dutyPercent: 30, maxRpm: 1500 },
  ] as FanChannel[];
  const bindings = [{ channelId: 'fan-a', slotKeys: ['front:120:0'] }, { channelId: 'fan-b', slotKeys: ['rear:120:0'] }];
  const flows = () => new Set(h.renderers[h.renderers.length - 1].setState.mock.calls.map(c => c[0].flow)).size;

  it('sends the scene once, then no new flow input for repeated topic pings with new identities and steady rpm', () => {
    setLayout({ settled: true, layout: { directions: {}, bindings, tests: [] } });
    h.setup = { record: record(1), loaded: true };
    const { rerender } = render(<CoolingCase3D channels={chans([950, 520, 0])} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    const first = flows();
    for (let ping = 2; ping < 40; ping++) {
      h.setup = { record: record(ping), loaded: true };
      setLayout({ layout: { directions: {}, bindings: bindings.map(b => ({ ...b, slotKeys: [...b.slotKeys] })), tests: [] } });
      rerender(<CoolingCase3D channels={chans([950 + (ping % 4) * 8, 520 - (ping % 3) * 5, 0])} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    }
    expect(flows()).toBe(first);
  });

  it('absorbs a fan curve easing the rpm by a tenth, and solves again for a real ramp', () => {
    setLayout({ settled: true, layout: { directions: {}, bindings, tests: [] } });
    h.setup = { record: record(1), loaded: true };
    const { rerender } = render(<CoolingCase3D channels={chans([950, 520, 0])} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    const first = flows();
    rerender(<CoolingCase3D channels={chans([1040, 570, 0])} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    expect(flows()).toBe(first);
    rerender(<CoolingCase3D channels={chans([1400, 900, 0])} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    expect(flows()).toBe(first + 1);
  });

  it('hands the scene a flow input on the render where the fans first appear, with no stale one before it', () => {
    setLayout({ settled: true, layout: { directions: {}, bindings, tests: [] } });
    h.setup = { record: record(1), loaded: true };
    render(<CoolingCase3D channels={chans([950, 520, 0])} selectedChannelId={null} onSelectChannel={vi.fn()} />);
    const calls = h.renderers[h.renderers.length - 1].setState.mock.calls.map(c => c[0].flow);
    const withFlow = calls.filter(f => f !== null);
    expect(withFlow.length).toBeGreaterThan(0);
    expect(new Set(withFlow).size).toBe(1);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

type StoreModule = typeof import('../../lib/monitoringStore');

let store: StoreModule;

beforeEach(async () => {
  vi.resetModules();
  store = await import('../../lib/monitoringStore');
});

function makeFrame(overrides: Record<string, unknown> = {}) {
  return {
    processes: {
      totalCpu: 45,
      totalMemoryPercent: 60,
      processes: [
        { name: 'Chrome', cpuPercent: 20, memoryMb: 500 },
        { name: 'VSCode', cpuPercent: 15, memoryMb: 300 },
      ],
    },
    network: {
      entries: [
        { name: 'Chrome', rateIn: 1024, rateOut: 512 },
      ],
    },
    gpu: [{ sensors: [{ id: 'gpu-load', value: 55 }] }],
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mock typing
  } as any;
}

describe('overview sparklines', () => {
  it('push60 maintains max 60 samples', () => {
    for (let i = 0; i < 70; i++) {
      store.ingestMonitoring(makeFrame({
        processes: { totalCpu: i, totalMemoryPercent: 0, processes: [] },
        network: { entries: [] },
      }));
    }
    const hist = store.getOverviewHist();
    expect(hist.cpu).toHaveLength(60);
    expect(hist.cpu[0]).toBe(10);
    expect(hist.cpu[59]).toBe(69);
  });

  it('handles empty processes gracefully', () => {
    store.ingestMonitoring(makeFrame({
      processes: null,
      network: null,
      gpu: null,
    }));
    const hist = store.getOverviewHist();
    expect(hist.cpu).toHaveLength(1);
    expect(hist.cpu[0]).toBe(0);
  });
});

describe('process grouping', () => {
  it('aggregates duplicate process names', () => {
    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 50,
        totalMemoryPercent: 70,
        processes: [
          { name: 'Chrome', cpuPercent: 10, memoryMb: 200 },
          { name: 'Chrome', cpuPercent: 15, memoryMb: 300 },
          { name: 'Chrome', cpuPercent: 5, memoryMb: 100 },
          { name: 'VSCode', cpuPercent: 8, memoryMb: 150 },
        ],
      },
    }));
    const data = store.getProcessData();
    const chrome = data.cpuSeries.find(s => s.name === 'Chrome');
    expect(chrome).toBeDefined();
    expect(chrome!.values[59]).toBe(30); // 10 + 15 + 5
  });
});

describe('Other calculation', () => {
  it('computes Other CPU as total - sum(top)', () => {
    store.ingestMonitoring(makeFrame());
    const data = store.getProcessData();
    const other = data.cpuSeries.find(s => s.name === 'Other');
    expect(other).toBeDefined();
    // totalCpu=45, Chrome=20, VSCode=15, so Other = 45-35 = 10
    expect(other!.current).toBe(10);
  });

  it('Other memory with no Memory Used sensor does not produce negative', () => {
    store.ingestMonitoring(makeFrame({
      memory: null,
      processes: {
        totalCpu: 10,
        totalMemoryPercent: 80,
        processes: [
          { name: 'App', cpuPercent: 5, memoryMb: 1000 },
        ],
      },
    }));
    const data = store.getProcessData();
    const other = data.memSeries.find(s => s.name === 'Other');
    expect(other).toBeDefined();
    expect(other!.current).toBeGreaterThanOrEqual(0);
  });

  it('Other memory with Memory Used sensor', () => {
    // Memory Used = 8 GB → totalUsedMb = 8192; topMemSum = 2000; Other = 6192.
    store.ingestMonitoring(makeFrame({
      memory: { sensors: [{ id: 'mem/used', name: 'Memory Used', value: 8, theoreticalMaximum: 16 }] },
      processes: {
        totalCpu: 10,
        totalMemoryPercent: 50,
        processes: [
          { name: 'App', cpuPercent: 5, memoryMb: 2000 },
        ],
      },
    }));
    const data = store.getProcessData();
    const other = data.memSeries.find(s => s.name === 'Other');
    expect(other!.current).toBe(6192);
  });
});

describe('padLeft', () => {
  it('pads series to 60 samples with leading zeros', () => {
    store.ingestMonitoring(makeFrame());
    const data = store.getProcessData();
    for (const s of data.cpuSeries) {
      expect(s.values).toHaveLength(60);
    }
  });
});

describe('color consistency', () => {
  it('same process name always gets same color', () => {
    const c1 = store.colorFor('Chrome');
    const c2 = store.colorFor('Chrome');
    const c3 = store.colorFor('Chrome');
    expect(c1).toBe(c2);
    expect(c2).toBe(c3);
  });

  it('different processes get different colors', () => {
    const c1 = store.colorFor('Chrome');
    const c2 = store.colorFor('Firefox');
    expect(c1).not.toBe(c2);
  });
});

describe('subscriber notifications', () => {
  it('notifies on ingest', () => {
    const cb = vi.fn();
    store.subscribe(cb);
    store.ingestMonitoring(makeFrame());
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const cb = vi.fn();
    store.subscribe(cb);
    store.ingestMonitoring(makeFrame());
    store.unsubscribe(cb);
    store.ingestMonitoring(makeFrame());
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('network data', () => {
  it('computes per-app rates in KB/s', () => {
    store.ingestMonitoring(makeFrame());
    const net = store.getNetworkData();
    expect(net.entries.length).toBeGreaterThan(0);
    const chrome = net.entries.find(e => e.name === 'Chrome');
    expect(chrome).toBeDefined();
    expect(chrome!.rateIn).toBe(1024);
    expect(chrome!.rateOut).toBe(512);
  });

  it('computes total rates across all apps', () => {
    store.ingestMonitoring(makeFrame({
      network: {
        entries: [
          { name: 'Chrome', rateIn: 1000, rateOut: 500 },
          { name: 'Slack', rateIn: 200, rateOut: 100 },
        ],
      },
    }));
    const net = store.getNetworkData();
    expect(net.totalRateIn).toBe(1200);
    expect(net.totalRateOut).toBe(600);
    expect(net.totalRate).toBe(1800);
  });
});

describe('screen time', () => {
  it('stores focus session and history', () => {
    store.ingestScreenTime({
      focus: { id: '1', name: 'Chrome', today: { total: 3600, hours: 1, minutes: 0, seconds: 0 } },
      history: [{ name: 'Chrome', totalMs: 3600000 }],
    });
    const st = store.getScreenTime();
    expect(st.focus?.name).toBe('Chrome');
    expect(st.history).toHaveLength(1);
  });

  it('clears focus when name is empty', () => {
    store.ingestScreenTime({
      focus: { id: '', name: '', today: { total: 0, hours: 0, minutes: 0, seconds: 0 } },
      history: [],
    });
    const st = store.getScreenTime();
    expect(st.focus).toBeNull();
  });
});

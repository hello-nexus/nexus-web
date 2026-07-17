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

describe('getAllCpuMemSeries (item 48: uncapped, no Other row)', () => {
  it('includes every process with no top-N cap and no Other aggregate', () => {
    const processes = Array.from({ length: 25 }, (_, i) => ({ name: `proc-${i}.exe`, cpuPercent: 1, memoryMb: 10 }));
    store.ingestMonitoring(makeFrame({
      processes: { totalCpu: 25, totalMemoryPercent: 25, processes },
    }));
    const { cpuSeries, memSeries } = store.getAllCpuMemSeries();
    expect(cpuSeries.length).toBe(25);
    expect(memSeries.length).toBe(25);
    expect(cpuSeries.some(s => s.name === 'Other')).toBe(false);
    expect(memSeries.some(s => s.name === 'Other')).toBe(false);
  });

  it('matches getProcessData\'s own per-process values (same source, just uncapped)', () => {
    store.ingestMonitoring(makeFrame());
    const capped = store.getProcessData();
    const all = store.getAllCpuMemSeries();
    const chromeCapped = capped.cpuSeries.find(s => s.name === 'Chrome')!;
    const chromeAll = all.cpuSeries.find(s => s.name === 'Chrome')!;
    expect(chromeAll.current).toBe(chromeCapped.current);
  });

  it('keeps a process at 0% CPU in the complete list instead of dropping it (round 5: task-manager parity)', () => {
    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        processes: [
          { name: 'Chrome', cpuPercent: 20, memoryMb: 500 },
          { name: 'IdleApp', cpuPercent: 0, memoryMb: 50 },
        ],
      },
    }));
    const { cpuSeries } = store.getAllCpuMemSeries();
    const idle = cpuSeries.find(s => s.name === 'IdleApp');
    expect(idle).toBeDefined();
    expect(idle!.current).toBe(0);
  });

  it('keeps reporting a process at 0% across several ticks, not just the tick it went idle', () => {
    for (let i = 0; i < 5; i++) {
      store.ingestMonitoring(makeFrame({
        processes: {
          totalCpu: 0,
          totalMemoryPercent: 10,
          processes: [{ name: 'IdleApp', cpuPercent: 0, memoryMb: 50 }],
        },
      }));
    }
    const { cpuSeries } = store.getAllCpuMemSeries();
    expect(cpuSeries.find(s => s.name === 'IdleApp')).toBeDefined();
  });

  it('drops a process from the complete list the moment it is absent from the frame (real exit)', () => {
    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        processes: [
          { name: 'Chrome', cpuPercent: 20, memoryMb: 500 },
          { name: 'ShortLived', cpuPercent: 5, memoryMb: 20 },
        ],
      },
    }));
    expect(store.getAllCpuMemSeries().cpuSeries.some(s => s.name === 'ShortLived')).toBe(true);

    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        processes: [{ name: 'Chrome', cpuPercent: 20, memoryMb: 500 }],
      },
    }));
    expect(store.getAllCpuMemSeries().cpuSeries.some(s => s.name === 'ShortLived')).toBe(false);
  });

  it('carries startedAtMs through to the complete list (round 5: recency-sort wiring)', () => {
    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        processes: [{ name: 'Chrome', cpuPercent: 20, memoryMb: 500, startedAtMs: 12_345 }],
      },
    }));
    const chrome = store.getAllCpuMemSeries().cpuSeries.find(s => s.name === 'Chrome');
    expect(chrome!.startedAtMs).toBe(12_345);
  });

  it('aggregates a multi-instance name to its newest instance\'s startedAtMs, matching the service\'s own ProcessAggregation.NewestOf', () => {
    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        processes: [
          { name: 'Chrome', cpuPercent: 10, memoryMb: 200, startedAtMs: 5_000 },
          { name: 'Chrome', cpuPercent: 5, memoryMb: 100, startedAtMs: 9_000 },
          { name: 'Chrome', cpuPercent: 5, memoryMb: 100, startedAtMs: 1_000 },
        ],
      },
    }));
    const chrome = store.getAllCpuMemSeries().cpuSeries.find(s => s.name === 'Chrome');
    expect(chrome!.startedAtMs).toBe(9_000);
  });

  it('leaves startedAtMs undefined when no instance reports it', () => {
    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        processes: [{ name: 'NoLaunchTime', cpuPercent: 5, memoryMb: 20 }],
      },
    }));
    const proc = store.getAllCpuMemSeries().cpuSeries.find(s => s.name === 'NoLaunchTime');
    expect(proc!.startedAtMs).toBeUndefined();
  });
});

describe('isApp/publisher/signed (round 5 items 5/6)', () => {
  it('trusts real isApp/publisher/signed the instant the service reports them', () => {
    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        processes: [{
          name: 'RealApp', cpuPercent: 20, memoryMb: 500,
          isApp: true, publisher: 'Real Publisher Inc.', signed: 'signed',
        }],
      },
    }));
    const proc = store.getAllCpuMemSeries().cpuSeries.find(s => s.name === 'RealApp');
    expect(proc!.isApp).toBe(true);
    expect(proc!.publisher).toBe('Real Publisher Inc.');
    expect(proc!.signed).toBe('signed');
  });

  it('trusts a real isApp:false with signed:unsigned and no publisher, without falling back to the dev mock', () => {
    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        // 'chrome.exe' is in the dev mock table (isApp:true, signed) - a real
        // wire report for the SAME name must win outright, proving `real` is
        // gated on isApp being reported at all, not on matching the mock.
        processes: [{ name: 'chrome.exe', cpuPercent: 5, memoryMb: 20, isApp: false, publisher: null, signed: 'unsigned' }],
      },
    }));
    const proc = store.getAllCpuMemSeries().cpuSeries.find(s => s.name === 'chrome.exe');
    expect(proc!.isApp).toBe(false);
    expect(proc!.publisher).toBeNull();
    expect(proc!.signed).toBe('unsigned');
  });

  it('fills in the dev mock for a recognized name while the real fields are entirely absent (DEV_TOOLS is on under vitest)', () => {
    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        processes: [{ name: 'chrome.exe', cpuPercent: 20, memoryMb: 500 }],
      },
    }));
    const proc = store.getAllCpuMemSeries().cpuSeries.find(s => s.name === 'chrome.exe');
    expect(proc!.isApp).toBe(true);
    expect(proc!.publisher).toBe('Google LLC');
    expect(proc!.signed).toBe('signed');
  });

  it('leaves isApp/publisher/signed undefined for an unrecognized name with no real data - graceful background default', () => {
    store.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        processes: [{ name: 'totally-unknown-proc.exe', cpuPercent: 5, memoryMb: 20 }],
      },
    }));
    const proc = store.getAllCpuMemSeries().cpuSeries.find(s => s.name === 'totally-unknown-proc.exe');
    expect(proc!.isApp).toBeUndefined();
    expect(proc!.publisher).toBeUndefined();
    expect(proc!.signed).toBeUndefined();
  });

  it('does not apply the dev mock when DEV_TOOLS is off (production behavior)', async () => {
    vi.resetModules();
    vi.doMock('../../lib/devTools', () => ({ DEV_TOOLS: false }));
    const prodStore: StoreModule = await import('../../lib/monitoringStore');
    prodStore.ingestMonitoring(makeFrame({
      processes: {
        totalCpu: 20,
        totalMemoryPercent: 40,
        processes: [{ name: 'chrome.exe', cpuPercent: 20, memoryMb: 500 }],
      },
    }));
    const proc = prodStore.getAllCpuMemSeries().cpuSeries.find(s => s.name === 'chrome.exe');
    expect(proc!.isApp).toBeUndefined();
    expect(proc!.publisher).toBeUndefined();
    vi.doUnmock('../../lib/devTools');
  });
});

describe('getAllNetSeries (item 48: uncapped network series)', () => {
  it('includes every process with network history, beyond the top-15 getNetworkData keeps', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ name: `net-${i}.exe`, rateIn: 100, rateOut: 100 }));
    store.ingestMonitoring(makeFrame({ network: { entries } }));
    const capped = store.getNetworkData();
    const all = store.getAllNetSeries();
    expect(capped.series.length).toBe(15);
    expect(all.length).toBe(20);
  });
});

describe('getGpuProcessData (item 51: uncapped procSeries, matching procMemSeries)', () => {
  it('includes every GPU process with no top-N cap', () => {
    const procs = Array.from({ length: 25 }, (_, i) => ({ name: `gpu-${i}.exe`, gpuPercent: 1, dedicatedMb: 10, adapterLuid: '' }));
    store.ingestGpuProcesses(procs);
    const { procSeries, procMemSeries } = store.getGpuProcessData('');
    expect(procSeries.length).toBe(25);
    expect(procMemSeries.length).toBe(25);
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

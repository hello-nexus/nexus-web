import { describe, expect, it } from 'vitest';
import type { MonitoringFrame } from '../../../types/monitoringFrame';
import type { ProcessRow } from './processesData';
import { resourceDomain, rowValue, systemValue, topRowsFor } from './processesResources';

const sensor = (name: string, type: string, value: number) =>
  ({ id: name, name, type, value, units: '', formatted: `${value}` });

function frame(over: Partial<MonitoringFrame> = {}): MonitoringFrame {
  return {
    cpu: { name: 'CPU', sensors: [sensor('CPU Total', 'Load', 42)] },
    gpu: [{ name: 'GPU', sensors: [sensor('GPU Core', 'Load', 71)] }],
    memory: { name: 'RAM', sensors: [sensor('Memory Load', 'Load', 55)] },
    storage: null, motherboard: null, cpuModel: '', gpuModels: [], memoryTotal: '',
    motherboardModel: '', processes: null, network: null,
    ...over,
  } as unknown as MonitoringFrame;
}

const rows: ProcessRow[] = [
  { name: 'chrome', cpu: 10, memMb: 2048, gpu: 20, io: 1000 },
  { name: 'code',   cpu: 30, memMb: 512,  gpu: 5,  io: 4000 },
  { name: 'idle',   cpu: 0,  memMb: 64 },
];

describe('systemValue', () => {
  it('reads CPU, GPU and memory load off the composite frame', () => {
    expect(systemValue('cpu', frame(), rows)).toBe(42);
    expect(systemValue('gpu', frame(), rows)).toBe(71);
    expect(systemValue('memory', frame(), rows)).toBe(55);
  });

  it('skips a GPU reporting no load and takes the next one', () => {
    const f = frame({ gpu: [
      { name: 'iGPU', sensors: [sensor('GPU Core', 'Load', 0)] },
      { name: 'dGPU', sensors: [sensor('GPU Core', 'Load', 88)] },
    ] } as Partial<MonitoringFrame>);
    expect(systemValue('gpu', f, rows)).toBe(88);
  });

  it('sums the per-process rates for I/O, so the graph and its rows describe the same quantity', () => {
    expect(systemValue('io', frame(), rows)).toBe(5000);
  });

  it('reads 0 rather than throwing when the frame is absent', () => {
    for (const r of ['cpu', 'gpu', 'memory'] as const) {
      expect(systemValue(r, null, [])).toBe(0);
    }
    expect(systemValue('io', null, [])).toBe(0);
  });

  it('treats a row with no I/O figure as contributing nothing', () => {
    expect(systemValue('io', frame(), [{ name: 'x', cpu: 1, memMb: 1 }])).toBe(0);
  });
});

describe('rowValue', () => {
  it('reads each resource off the row', () => {
    expect(rowValue('cpu', rows[0])).toBe(10);
    expect(rowValue('memory', rows[0])).toBe(2048);
    expect(rowValue('gpu', rows[0])).toBe(20);
    expect(rowValue('io', rows[0])).toBe(1000);
  });

  it('is undefined where the platform reports nothing, which is what hides the row', () => {
    expect(rowValue('gpu', rows[2])).toBeUndefined();
    expect(rowValue('io', rows[2])).toBeUndefined();
  });
});

describe('topRowsFor', () => {
  it('ranks by the resource, biggest first', () => {
    expect(topRowsFor('cpu', rows, 3).map(r => r.name)).toEqual(['code', 'chrome', 'idle']);
    expect(topRowsFor('memory', rows, 3).map(r => r.name)).toEqual(['chrome', 'code', 'idle']);
    expect(topRowsFor('io', rows, 3).map(r => r.name)).toEqual(['code', 'chrome']);
  });

  it('drops rows with no figure for that resource rather than ranking them as 0', () => {
    expect(topRowsFor('gpu', rows, 5).map(r => r.name)).toEqual(['chrome', 'code']);
  });

  it('honours the limit', () => {
    expect(topRowsFor('cpu', rows, 1).map(r => r.name)).toEqual(['code']);
  });

  it('breaks ties by name so equal values never swap between frames', () => {
    const tied: ProcessRow[] = [
      { name: 'b', cpu: 5, memMb: 1 },
      { name: 'a', cpu: 5, memMb: 1 },
    ];
    expect(topRowsFor('cpu', tied, 2).map(r => r.name)).toEqual(['a', 'b']);
  });
});

describe('resourceDomain', () => {
  it('pins percentages to 0-100 and lets a byte rate auto-scale', () => {
    expect(resourceDomain('cpu')).toEqual([0, 100]);
    expect(resourceDomain('gpu')).toEqual([0, 100]);
    expect(resourceDomain('memory')).toEqual([0, 100]);
    expect(resourceDomain('io')).toBeUndefined();
  });
});

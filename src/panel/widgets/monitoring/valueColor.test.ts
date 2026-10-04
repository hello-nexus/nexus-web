import { describe, expect, it } from 'vitest';
import { defaultValueColorReverse, sensorSupportsValueColor } from './valueColor';

describe('sensorSupportsValueColor', () => {
  it('offers the colouring for every resolved sensor type', () => {
    for (const type of ['Load', 'Temperature', 'Power', 'Clock', 'Fan', 'Voltage', 'Data', 'SmallData', 'Throughput', 'Rate', 'Factor']) {
      expect(sensorSupportsValueColor(type, 'gpu')).toBe(true);
    }
  });

  it('needs a resolved sensor, except FPS', () => {
    expect(sensorSupportsValueColor(undefined, 'cpu')).toBe(false);
    expect(sensorSupportsValueColor(undefined, 'fps')).toBe(true);
  });
});

describe('defaultValueColorReverse', () => {
  it('reverses headroom readings, where a low value is the warning', () => {
    expect(defaultValueColorReverse('storage', 'Free')).toBe(true);
    expect(defaultValueColorReverse('memory', 'Memory Available')).toBe(true);
    expect(defaultValueColorReverse('gpu', 'GPU Memory Free')).toBe(true);
    expect(defaultValueColorReverse('smart', 'Life')).toBe(true);
    expect(defaultValueColorReverse('smart', 'Available Spare')).toBe(true);
  });

  it('runs usage, power and temperature hot-high', () => {
    expect(defaultValueColorReverse('storage', 'Used')).toBe(false);
    expect(defaultValueColorReverse('gpu', 'GPU Memory Used')).toBe(false);
    expect(defaultValueColorReverse('gpu', 'GPU Package')).toBe(false);
    expect(defaultValueColorReverse('cpu', 'Core (Tctl/Tdie)')).toBe(false);
    expect(defaultValueColorReverse('smart', 'Percentage Used')).toBe(false);
  });

  it('keeps FPS reversed and Frame Time hot-high', () => {
    expect(defaultValueColorReverse('fps', 'FPS')).toBe(true);
    expect(defaultValueColorReverse('fps', 'Frame Time')).toBe(false);
  });
});

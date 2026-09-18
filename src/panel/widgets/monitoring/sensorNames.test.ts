// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bareSensorLabel, prefixedSensorLabel } from './sensorNames';

describe('sensorNames', () => {
  describe('bareSensorLabel', () => {
    it('strips a matching device prefix from the start of the name', () => {
      expect(bareSensorLabel('cpu', 'CPU Total')).toBe('Total');
      expect(bareSensorLabel('gpu', 'GPU Core')).toBe('Core');
      expect(bareSensorLabel('memory', 'Memory Usage')).toBe('Usage');
      expect(bareSensorLabel('network', 'Network In')).toBe('In');
    });

    it('case-insensitive on the prefix match', () => {
      expect(bareSensorLabel('cpu', 'cpu Total')).toBe('Total');
    });

    it('returns the input unchanged when the name does not start with the prefix', () => {
      expect(bareSensorLabel('cpu', 'Total')).toBe('Total');
      expect(bareSensorLabel('gpu', 'Voltage')).toBe('Voltage');
    });

    it('is a no-op for devices without a prefix', () => {
      expect(bareSensorLabel('storage', 'Drive C')).toBe('Drive C');
      expect(bareSensorLabel('fan', 'Fan 1')).toBe('Fan 1');
      expect(bareSensorLabel('fps', 'FPS')).toBe('FPS');
    });

    it('returns empty when the name is exactly the prefix (no suffix)', () => {
      expect(bareSensorLabel('cpu', 'CPU')).toBe('');
    });
  });

  describe('prefixedSensorLabel', () => {
    it('prepends the device prefix to a bare name', () => {
      expect(prefixedSensorLabel('cpu', 'Total')).toBe('CPU Total');
      expect(prefixedSensorLabel('memory', 'Usage')).toBe('Memory Usage');
    });

    it('is idempotent on already-prefixed names', () => {
      expect(prefixedSensorLabel('cpu', 'CPU Total')).toBe('CPU Total');
      expect(prefixedSensorLabel('gpu', 'GPU Hotspot')).toBe('GPU Hotspot');
    });

    it('returns the input unchanged for devices without a prefix', () => {
      expect(prefixedSensorLabel('storage', 'Drive C')).toBe('Drive C');
      expect(prefixedSensorLabel('fan', 'Fan 1')).toBe('Fan 1');
    });

    it('falls back to just the prefix when the name is empty or matches the prefix', () => {
      expect(prefixedSensorLabel('cpu', 'CPU')).toBe('CPU');
    });
  });
});

describe('igpu labels', () => {
  it('strips the GPU word the sensor arrives with and captions under iGPU', () => {
    expect(bareSensorLabel('igpu', 'GPU Core')).toBe('Core');
    expect(bareSensorLabel('igpu', 'GPU VR SoC')).toBe('VR SoC');
    expect(prefixedSensorLabel('igpu', 'GPU Core')).toBe('iGPU Core');
    expect(prefixedSensorLabel('igpu', 'Core')).toBe('iGPU Core');
    // Idempotent on its own output, like every other device.
    expect(prefixedSensorLabel('igpu', 'iGPU Core')).toBe('iGPU Core');
    expect(bareSensorLabel('igpu', 'iGPU')).toBe('');
  });
});

describe('gpu2 labels', () => {
  it('strips the GPU word the sensor arrives with and captions under GPU 2, idempotently', () => {
    expect(bareSensorLabel('gpu2', 'GPU Core')).toBe('Core');
    expect(prefixedSensorLabel('gpu2', 'GPU Core')).toBe('GPU 2 Core');
    expect(prefixedSensorLabel('gpu2', 'GPU 2 Core')).toBe('GPU 2 Core');
    expect(bareSensorLabel('gpu2', 'GPU 2')).toBe('');
  });
});

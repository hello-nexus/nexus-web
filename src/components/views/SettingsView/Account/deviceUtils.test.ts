// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEVICE_HOSTNAME_MAX_LENGTH, generateManualInstallId, isValidDeviceHostname, systemSpecsToDeviceSpecs, trimDeviceSpecs,
} from './deviceUtils';
import type { SystemSpecs } from '../../../../hooks/useSystemSpecs';

describe('generateManualInstallId', () => {
  it('generates a "manual-" prefix followed by 32 hex characters', () => {
    const id = generateManualInstallId();

    expect(id).toMatch(/^manual-[0-9a-f]{32}$/);
  });

  it('generates a different id on each call', () => {
    expect(generateManualInstallId()).not.toBe(generateManualInstallId());
  });
});

describe('isValidDeviceHostname', () => {
  it('rejects an empty or whitespace-only name', () => {
    expect(isValidDeviceHostname('')).toBe(false);
    expect(isValidDeviceHostname('   ')).toBe(false);
  });

  it('accepts a normal name', () => {
    expect(isValidDeviceHostname('Battlestation')).toBe(true);
  });

  it('rejects a name over the length cap', () => {
    expect(isValidDeviceHostname('x'.repeat(DEVICE_HOSTNAME_MAX_LENGTH + 1))).toBe(false);
  });

  it('accepts a name at exactly the length cap', () => {
    expect(isValidDeviceHostname('x'.repeat(DEVICE_HOSTNAME_MAX_LENGTH))).toBe(true);
  });
});

describe('trimDeviceSpecs', () => {
  it('drops blank and whitespace-only fields', () => {
    expect(trimDeviceSpecs({ processor: 'Ryzen 9', memory: '', monitor: '   ' })).toEqual({ processor: 'Ryzen 9' });
  });

  it('trims surrounding whitespace on kept values', () => {
    expect(trimDeviceSpecs({ processor: '  Ryzen 9  ' })).toEqual({ processor: 'Ryzen 9' });
  });

  it('returns an empty object when every field is blank', () => {
    expect(trimDeviceSpecs({ processor: '', memory: '' })).toEqual({});
  });
});

describe('systemSpecsToDeviceSpecs', () => {
  it('copies string fields and ignores the non-string hardwareIds object', () => {
    const specs = {
      pcName: 'DESKTOP-1', osBuild: '', processor: 'CPU',
      hardwareIds: { board: { manufacturer: 'Acme', product: 'B1' }, gpus: [{ vendor: '10de' }] },
    } as unknown as SystemSpecs;

    const result = systemSpecsToDeviceSpecs(specs);

    expect(result).toEqual({ pcName: 'DESKTOP-1', processor: 'CPU' });
  });
});

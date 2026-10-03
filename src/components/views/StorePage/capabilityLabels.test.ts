import { describe, expect, it } from 'vitest';
import { KNOWN_DISPATCH_ACTIONS, capabilityGrants, capabilityLabel } from './capabilityLabels';
import en from '../../../locales/en.json';

const t = (key: string, params?: Record<string, string | number>) => {
  let text = key;
  if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
  return text;
};

describe('capabilityLabel', () => {
  it('uses a specific key for each registered dispatch action', () => {
    expect(capabilityLabel('dispatch:lighting.setMode', t)).toBe('store.consent.cap.lighting.setMode');
    expect(capabilityLabel('dispatch:system.openUrl', t)).toBe('store.consent.cap.system.openUrl');
  });

  it('falls back to the unknown-action label with the action name', () => {
    expect(capabilityLabel('dispatch:cooling.setFan', t)).toBe('store.consent.cap.dispatchUnknown action=cooling.setFan');
  });

  it('parametrizes host, sensor pattern and import path', () => {
    expect(capabilityLabel('net.fetch:api.example.com', t)).toBe('store.consent.cap.netFetch host=api.example.com');
    expect(capabilityLabel('sensors.read:cpu.*', t)).toBe('store.consent.cap.sensorsRead pattern=cpu.*');
    expect(capabilityLabel('mediaImport:/apps-api/media', t)).toBe('store.consent.cap.mediaImport path=/apps-api/media');
  });

  it('keeps colons inside the value', () => {
    expect(capabilityLabel('net.fetch:host:8080', t)).toBe('store.consent.cap.netFetch host=host:8080');
  });

  it('maps the flag grants', () => {
    expect(capabilityLabel('rgb.read', t)).toBe('store.consent.cap.rgbRead');
    expect(capabilityLabel('rgb.write', t)).toBe('store.consent.cap.rgbWrite');
  });

  it('shows an unrecognised grant verbatim rather than hiding it', () => {
    expect(capabilityLabel('teleport', t)).toBe('teleport');
    expect(capabilityLabel('future.kind:x', t)).toBe('future.kind:x');
  });

  it('has an English label for every known action and flag', () => {
    const keys = new Set(Object.keys(en));
    for (const action of KNOWN_DISPATCH_ACTIONS) expect(keys.has(`store.consent.cap.${action}`), action).toBe(true);
    for (const grant of ['rgb.read', 'rgb.write', 'telemetry']) {
      expect(keys.has(capabilityLabel(grant, k => k)), grant).toBe(true);
    }
  });
});

describe('capabilityGrants', () => {
  it('flattens every permission kind in listing order', () => {
    expect(capabilityGrants({
      'rgb.write': true,
      mediaImport: ['/apps-api/media'],
      'sensors.read': ['cpu.*'],
      'net.fetch': ['API.Example.com'],
      dispatch: ['lighting.setMode'],
      'rgb.read': true,
    })).toEqual([
      'dispatch:lighting.setMode',
      'net.fetch:api.example.com',
      'sensors.read:cpu.*',
      'mediaImport:/apps-api/media',
      'rgb.read',
      'rgb.write',
    ]);
  });

  it('lists telemetry as a permission only when granted', () => {
    expect(capabilityGrants({ telemetry: true })).toEqual(['telemetry']);
    expect(capabilityGrants({ telemetry: false })).toEqual([]);
  });

  it('never lists appData or audio, which are not permissions', () => {
    expect(capabilityGrants({ appData: true, audio: true, config: true, code: 'worker' })).toEqual([]);
  });

  it('ignores malformed author JSON', () => {
    expect(capabilityGrants(null)).toEqual([]);
    expect(capabilityGrants('dispatch')).toEqual([]);
    expect(capabilityGrants({ dispatch: 'lighting.setMode', 'net.fetch': [42, '', ' '], 'rgb.write': 'yes' })).toEqual([]);
  });

  it('drops duplicates', () => {
    expect(capabilityGrants({ dispatch: ['system.specs', ' system.specs'] })).toEqual(['dispatch:system.specs']);
  });
});

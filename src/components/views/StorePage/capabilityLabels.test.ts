import { describe, expect, it } from 'vitest';
import { KNOWN_DISPATCH_ACTIONS, capabilityLabel } from './capabilityLabels';
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
    expect(capabilityLabel('appData', t)).toBe('store.consent.cap.appData');
    expect(capabilityLabel('audio', t)).toBe('store.consent.cap.audio');
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
    for (const grant of ['appData', 'audio', 'rgb.read', 'rgb.write']) {
      expect(keys.has(capabilityLabel(grant, k => k)), grant).toBe(true);
    }
  });
});

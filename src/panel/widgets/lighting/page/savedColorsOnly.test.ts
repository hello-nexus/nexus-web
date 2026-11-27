import { describe, expect, it } from 'vitest';
import type { LightingDevice } from '../../../../api/lighting';
import { modeBlockedBySavedColors, savesColorsToDevice, selectionSavesColors } from './savedColorsOnly';

const card = (id: string, extra: Partial<LightingDevice> = {}) => ({ id, ...extra }) as LightingDevice;
const saved = (id: string) => card(id, { saveToDeviceSupported: true, savedToDevice: true });

describe('savedColorsOnly', () => {
  it('flags only a supporting card with the toggle on', () => {
    expect(savesColorsToDevice(saved('a'))).toBe(true);
    expect(savesColorsToDevice(card('a', { saveToDeviceSupported: true }))).toBe(false);
    expect(savesColorsToDevice(card('a', { savedToDevice: true }))).toBe(false);
  });

  it('limits the picker when any selected card saves colors', () => {
    const devices = [saved('kb'), card('fan')];
    expect(selectionSavesColors(devices, new Set(['kb']))).toBe(true);
    expect(selectionSavesColors(devices, new Set(['fan', 'kb']))).toBe(true);
    expect(selectionSavesColors(devices, new Set(['fan']))).toBe(false);
    expect(selectionSavesColors(devices, new Set())).toBe(false);
  });

  it('blocks every mode except static and off', () => {
    expect(modeBlockedBySavedColors('animate')).toBe(true);
    expect(modeBlockedBySavedColors('screen')).toBe(true);
    expect(modeBlockedBySavedColors('gif')).toBe(true);
    expect(modeBlockedBySavedColors('static')).toBe(false);
    expect(modeBlockedBySavedColors('none')).toBe(false);
  });
});

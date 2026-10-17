import { describe, expect, it } from 'vitest';
import type { DetectedConflict } from '../../../../api/conflicts';
import type { LightingDevice } from '../../../../api/lighting';
import { conflictAppsForCard, controlledByStrips } from './controlledBy';

const card = (id: string, extra: Partial<LightingDevice> = {}): LightingDevice => ({
  id, name: id, ledsOn: true, ledCount: 1, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0, ...extra,
});
const app = (id: string, extra: Partial<DetectedConflict> = {}): DetectedConflict => ({
  id, displayName: id.toUpperCase(), category: 'lighting', processName: `${id}.exe`, pid: 1, ...extra,
});
const none = new Map<string, string>();

describe('conflictAppsForCard', () => {
  const running = [app('signalrgb', { claimsAllRgb: true }), app('icue'), app('other')];

  it('puts vendor apps before universal ones and drops unmatched apps', () => {
    const c = card('a', { conflictAppIds: ['signalrgb', 'icue'] });
    expect(conflictAppsForCard(c, running, none).map(x => x.id)).toEqual(['icue', 'signalrgb']);
  });

  it('lists an app once even when it runs several processes', () => {
    const c = card('a', { conflictAppIds: ['icue'] });
    expect(conflictAppsForCard(c, [app('icue'), app('icue', { pid: 2 })], none)).toHaveLength(1);
  });

  it('maps a hub card through its handler instead of conflictAppIds', () => {
    const c = card('a', { controlHandlerId: 'hub', conflictAppIds: ['icue'] });
    expect(conflictAppsForCard(c, running, new Map([['hub', 'other']])).map(x => x.id)).toEqual(['other']);
    expect(conflictAppsForCard(c, running, none)).toEqual([]);
  });
});

describe('controlledByStrips', () => {
  const running = [app('icue')];

  it('hosts one strip per device on its last card', () => {
    const cards = [
      card('z0', { deviceId: 'kb', conflictAppIds: ['icue'] }),
      card('z1', { deviceId: 'kb', conflictAppIds: ['icue'] }),
    ];
    const strips = controlledByStrips(cards, running, none);
    expect([...strips.keys()]).toEqual(['z1']);
  });

  it('is controlled when any zone of the device is driven', () => {
    const cards = [
      card('z0', { deviceId: 'kb', conflictAppIds: ['icue'], controlled: false }),
      card('z1', { deviceId: 'kb', conflictAppIds: ['icue'] }),
    ];
    expect(controlledByStrips(cards, running, none).get('z1')?.controlled).toBe(true);
    const off = cards.map(c => ({ ...c, controlled: false }));
    expect(controlledByStrips(off, running, none).get('z1')?.controlled).toBe(false);
  });

  it('gives cards with no matching running app no strip', () => {
    expect(controlledByStrips([card('a', { conflictAppIds: ['openrgb'] })], running, none).size).toBe(0);
    expect(controlledByStrips([card('a', { conflictAppIds: ['icue'] })], [], none).size).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { DetectedConflict } from '../../../../api/conflicts';
import type { LightingDevice } from '../../../../api/lighting';
import { conflictAppsForCard, controlledByStrips, type CuratedControlByHandler } from './controlledBy';

const card = (id: string, extra: Partial<LightingDevice> = {}): LightingDevice => ({
  id, name: id, ledsOn: true, ledCount: 1, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0, ...extra,
});
const app = (id: string, extra: Partial<DetectedConflict> = {}): DetectedConflict => ({
  id, displayName: id.toUpperCase(), category: 'lighting', processName: `${id}.exe`, pid: 1, ...extra,
});
const none: CuratedControlByHandler = new Map();
const any = () => true;

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
    expect(conflictAppsForCard(c, running, new Map([['hub', { appId: 'other', enabled: true }]])).map(x => x.id)).toEqual(['other']);
    expect(conflictAppsForCard(c, running, none)).toEqual([]);
  });
});

describe('controlledByStrips', () => {
  const running = [app('icue')];
  const corsair: CuratedControlByHandler = new Map([['corsair', { appId: 'icue', enabled: true }]]);

  it('hosts one strip per device on its last card', () => {
    const cards = [
      card('z0', { deviceId: 'kb', conflictAppIds: ['icue'] }),
      card('z1', { deviceId: 'kb', conflictAppIds: ['icue'] }),
    ];
    expect([...controlledByStrips(cards, cards, running, none, any).keys()]).toEqual(['z1']);
  });

  it('keeps devices that share a handler apart, each with its own state', () => {
    const cards = [
      card('a', { deviceId: 'dev-a', controlHandlerId: 'corsair', controlled: false }),
      card('b', { deviceId: 'dev-b', controlHandlerId: 'corsair' }),
    ];
    const strips = controlledByStrips(cards, cards, running, corsair, any);
    expect(strips.get('a')?.controlled).toBe(false);
    expect(strips.get('b')?.controlled).toBe(true);
    expect(strips.size).toBe(2);
  });

  it('groups by card id when the service sends an empty deviceId', () => {
    const cards = [
      card('a', { deviceId: '', controlHandlerId: 'corsair' }),
      card('b', { deviceId: '', controlHandlerId: 'corsair' }),
    ];
    expect(controlledByStrips(cards, cards, running, corsair, any).size).toBe(2);
  });

  it('is controlled when any zone of the device is driven', () => {
    const cards = [
      card('z0', { deviceId: 'kb', conflictAppIds: ['icue'], controlled: false }),
      card('z1', { deviceId: 'kb', conflictAppIds: ['icue'] }),
    ];
    expect(controlledByStrips(cards, cards, running, none, any).get('z1')?.controlled).toBe(true);
    const off = cards.map(c => ({ ...c, controlled: false }));
    expect(controlledByStrips(off, off, running, none, any).get('z1')?.controlled).toBe(false);
  });

  it('skips a zone that cannot show the strip when choosing the host', () => {
    const cards = [
      card('z0', { deviceId: 'kb', conflictAppIds: ['icue'] }),
      card('z1', { deviceId: 'kb', conflictAppIds: ['icue'], ledCount: 0 }),
    ];
    const strips = controlledByStrips(cards, cards, running, none, c => c.ledCount > 0);
    expect([...strips.keys()]).toEqual(['z0']);
    expect(controlledByStrips(cards, cards, running, none, () => false).size).toBe(0);
  });

  it('decides the state from every zone, not only the visible ones', () => {
    const cards = [
      card('z0', { deviceId: 'kb', conflictAppIds: ['icue'] }),
      card('z1', { deviceId: 'kb', conflictAppIds: ['icue'], controlled: false }),
    ];
    const strips = controlledByStrips(cards, [cards[1]], running, none, any);
    expect([...strips.keys()]).toEqual(['z1']);
    expect(strips.get('z1')?.controlled).toBe(true);
  });

  it('treats a hub card as not controlled while its Nexus Control gate is off', () => {
    const cards = [card('a', { deviceId: 'dev-a', controlHandlerId: 'corsair' })];
    const gateOff: CuratedControlByHandler = new Map([['corsair', { appId: 'icue', enabled: false }]]);
    expect(controlledByStrips(cards, cards, running, gateOff, any).get('a')?.controlled).toBe(false);
  });

  it('gives cards with no matching running app no strip', () => {
    const c = [card('a', { conflictAppIds: ['openrgb'] })];
    expect(controlledByStrips(c, c, running, none, any).size).toBe(0);
    const d = [card('a', { conflictAppIds: ['icue'] })];
    expect(controlledByStrips(d, d, [], none, any).size).toBe(0);
  });
});

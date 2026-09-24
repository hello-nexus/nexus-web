import { describe, expect, it } from 'vitest';
import { eventsBetween } from './clipEvents';

const events = [{ t: 0 }, { t: 1.35 }, { t: 3.6 }, { t: 7.4 }];
const at = (prev: number, now: number) => eventsBetween(events, prev, now).map((e) => e.t);

describe('eventsBetween', () => {
  it('fires events at time 0 for a freshly started action', () => {
    expect(at(-1, 0.02)).toEqual([0]);
  });

  it('fires each event once as the action time crosses it', () => {
    expect(at(1.3, 1.35)).toEqual([1.35]);
    expect(at(1.35, 1.4)).toEqual([]);
    expect(at(3.55, 3.62)).toEqual([3.6]);
  });

  it('fires the tail and the head when a looping action wraps', () => {
    expect(at(7.3, 0.05)).toEqual([0, 7.4]);
  });
});

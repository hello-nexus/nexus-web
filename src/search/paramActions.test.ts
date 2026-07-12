import { describe, it, expect } from 'vitest';
import { buildParamEntries } from './paramActions';
import type { CommandContext } from './types';
import { EMPTY_LIVE_STATE, type SearchLiveState } from './useSearchLiveState';

function ctx(over?: { online?: boolean; live?: Partial<SearchLiveState> }): CommandContext {
  return {
    t: (k: string) => k,
    online: over?.online ?? true,
    live: { ...EMPTY_LIVE_STATE, volume: { supported: true, volume: 0.4, muted: false }, ...over?.live },
  } as CommandContext;
}

const ids = (q: string, c = ctx()) => buildParamEntries(q, c).map((e) => e.id);

describe('buildParamEntries', () => {
  it('parses "brightness 60" and "volume 25" into value actions', () => {
    expect(ids('brightness 60')).toEqual(['param:brightness']);
    expect(ids('volume 25')).toEqual(['param:volume']);
  });

  it('accepts prefixes of at least 3 chars, a trailing %, and clamps to 100', () => {
    expect(ids('bri 40')).toEqual(['param:brightness']);
    expect(ids('vol 30%')).toEqual(['param:volume']);
    const entry = buildParamEntries('brightness 250', ctx())[0];
    expect(entry.title).toContain('100%');
  });

  it('rejects non-value queries and too-short triggers', () => {
    expect(ids('plasma')).toEqual([]);
    expect(ids('b 40')).toEqual([]);
    expect(ids('brightness')).toEqual([]);
    expect(ids('12*8')).toEqual([]);
  });

  it('gates brightness on online and volume on host support', () => {
    expect(ids('brightness 60', ctx({ online: false }))).toEqual([]);
    expect(ids('volume 25', ctx({ live: { volume: { supported: false, volume: 0, muted: false } } }))).toEqual([]);
    expect(ids('volume 25', ctx({ live: { volume: null } }))).toEqual([]);
  });

  it('matches the localized label too, including non-ASCII', () => {
    const c = { ...ctx(), t: (k: string) => (k === 'lighting.devices.brightness' ? 'Helligkeit' : k) } as CommandContext;
    expect(buildParamEntries('helligkeit 30', c).map((e) => e.id)).toEqual(['param:brightness']);
    const pl = { ...ctx(), t: (k: string) => (k === 'search.volume.label' ? 'Głośność systemu' : k) } as CommandContext;
    expect(buildParamEntries('głośność 45', pl).map((e) => e.id)).toEqual(['param:volume']);
    const ja = { ...ctx(), t: (k: string) => (k === 'search.volume.label' ? 'システム音量' : k) } as CommandContext;
    expect(buildParamEntries('システム音量 45', ja).map((e) => e.id)).toEqual(['param:volume']);
  });
});

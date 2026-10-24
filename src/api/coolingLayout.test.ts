import { describe, expect, it, vi } from 'vitest';
import { normalizeCoolingLayout, saveCoolingLayout, type CoolingLayout, type CoolingLayoutRecord, type CoolingLayoutWrite } from './coolingLayout';

const rec = (rev: number, layout: Partial<CoolingLayout> = {}): CoolingLayoutRecord => ({ rev, layout: { directions: {}, bindings: [], tests: [], ...layout } });
const addDir = (l: CoolingLayout): CoolingLayout => ({ ...l, directions: { ...l.directions, 'a:120:0': 'intake' } });

describe('saveCoolingLayout', () => {
  it('saves on the first try', async () => {
    const put = vi.fn(async (): Promise<CoolingLayoutWrite> => ({ kind: 'saved', record: rec(2) }));
    const res = await saveCoolingLayout(rec(1), addDir, put);
    expect(res.kind).toBe('saved');
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(1, expect.objectContaining({ directions: { 'a:120:0': 'intake' } }));
  });

  it('on 409 replays the edit on the service copy with its revision, once', async () => {
    const theirs = rec(5, { bindings: [{ channelId: 'f', slotKeys: ['x'] }] });
    const put = vi.fn()
      .mockResolvedValueOnce({ kind: 'conflict', record: theirs })
      .mockResolvedValueOnce({ kind: 'saved', record: rec(6) });
    const res = await saveCoolingLayout(rec(1), addDir, put);
    expect(res.kind).toBe('saved');
    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[1][0]).toBe(5);
    expect(put.mock.calls[1][1]).toEqual({ directions: { 'a:120:0': 'intake' }, bindings: [{ channelId: 'f', slotKeys: ['x'] }], tests: [] });
  });

  it('gives up after a second conflict and returns the newer record', async () => {
    const put = vi.fn()
      .mockResolvedValueOnce({ kind: 'conflict', record: rec(5) })
      .mockResolvedValueOnce({ kind: 'conflict', record: rec(6) });
    const res = await saveCoolingLayout(rec(1), addDir, put);
    expect(put).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ kind: 'conflict', record: rec(6) });
  });

  it('does not retry an invalid or unreachable write', async () => {
    const put = vi.fn(async (): Promise<CoolingLayoutWrite> => ({ kind: 'invalid', msg: 'no' }));
    expect((await saveCoolingLayout(rec(1), addDir, put)).kind).toBe('invalid');
    expect(put).toHaveBeenCalledTimes(1);
  });
});

describe('normalizeCoolingLayout', () => {
  it('drops malformed parts', () => {
    expect(normalizeCoolingLayout({
      directions: { a: 'intake', b: 'sideways' },
      bindings: [{ channelId: 'c', slotKeys: ['x', 3] }, { channelId: 4 }, null],
      tests: 'no',
    })).toEqual({ directions: { a: 'intake' }, bindings: [{ channelId: 'c', slotKeys: ['x'] }], tests: [] });
    expect(normalizeCoolingLayout(null)).toEqual({ directions: {}, bindings: [], tests: [] });
  });
});

describe('normalizeCoolingLayout caps', () => {
  it('holds a layout to the service caps', () => {
    const long = 'k'.repeat(129);
    const out = normalizeCoolingLayout({
      directions: { [long]: 'intake', ok: 'exhaust' },
      bindings: [{ channelId: 'c', slotKeys: Array.from({ length: 20 }, (_, i) => `s${i}`) }, { channelId: long, slotKeys: [] }],
      tests: [
        { id: 't', name: 'n'.repeat(65), moves: [], directions: {} },
        { id: 't2', name: 'ok', moves: [{ from: 'a', to: 'b' }, { from: long, to: 'b' }], directions: { x: 'intake' } },
      ],
    });
    expect(out.directions).toEqual({ ok: 'exhaust' });
    expect(out.bindings).toHaveLength(1);
    expect(out.bindings[0].slotKeys).toHaveLength(16);
    expect(out.tests).toEqual([{ id: 't2', name: 'ok', moves: [{ from: 'a', to: 'b' }], directions: { x: 'intake' } }]);
  });
});

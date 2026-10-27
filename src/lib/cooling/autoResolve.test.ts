import { beforeEach, describe, expect, it } from 'vitest';
import type { PcSetupRecord } from '../../api/pcSetup';
import { forgetTried, hasTried, layoutNeedsResolve, markTried, resetTried, resolveOutcome } from './autoResolve';

const record = (rev: number, layout?: Record<string, unknown>): PcSetupRecord => ({
  rev,
  setup: { version: 1, case: {}, items: [], resolved: { objects: [], ...(layout ? { caseLayout: layout } : {}) } },
});

describe('layoutNeedsResolve', () => {
  beforeEach(() => resetTried());

  it('needs a resolve when the record holds no layout', () => {
    expect(layoutNeedsResolve(record(0), 'k1', 'hyte-y70')).toBe(true);
  });

  it('needs one when the layout was resolved for other inputs, or for none', () => {
    expect(layoutNeedsResolve(record(2, { caseModel: 'HYTE Y70', inputKey: 'k0' }), 'k1', 'hyte-y70')).toBe(true);
    expect(layoutNeedsResolve(record(2, { caseModel: 'HYTE Y70' }), 'k1', 'hyte-y70')).toBe(true);
  });

  it('needs none when the layout was resolved for these inputs', () => {
    expect(layoutNeedsResolve(record(2, { caseModel: 'HYTE Y70', inputKey: 'k1' }), 'k1', 'hyte-y70')).toBe(false);
  });

  it('needs one again when the PC has a card the layout does not draw, until it draws one', () => {
    const key = 'case=c|cpu=x|gpu=Gigabyte GeForce RTX 3070|board=y';
    const bare = { caseModel: 'HYTE Y70', inputKey: key, boxes: [{ slot: 'psu', role: 'part' }, { slot: 'gpu', role: 'detail' }] };
    expect(layoutNeedsResolve(record(2, bare), key, 'hyte-y70')).toBe(true);
    expect(layoutNeedsResolve(record(2, { ...bare, boxes: [...bare.boxes, { slot: 'gpu', role: 'part' }] }), key, 'hyte-y70')).toBe(false);
    expect(layoutNeedsResolve(record(2, { ...bare, inputKey: 'case=c|gpu=' }), 'case=c|gpu=', 'hyte-y70')).toBe(false);
  });

  it('asks for the missing card once per key, even after a reload', () => {
    const key = 'case=c|cpu=x|gpu=Unlisted Card|board=y';
    const bare = { caseModel: 'HYTE Y70', inputKey: key, boxes: [{ slot: 'gpu', role: 'detail' }] };
    expect(layoutNeedsResolve(record(2, bare), key, 'hyte-y70')).toBe(true);
    markTried(key);
    expect(layoutNeedsResolve(record(2, bare), key, 'hyte-y70')).toBe(false);
    expect(layoutNeedsResolve(record(2, bare), key.replace('Unlisted', 'Other'), 'hyte-y70')).toBe(true);
  });

  it('re-resolves once when the key gains card ids, and not on a later load with the same key', () => {
    const oldKey = 'case=c|cpu=x|gpu=Unlisted Card|board=y';
    const newKey = `${oldKey}|gpuids=10de:2704:1043:889e`;
    const bare = (inputKey: string) => ({ caseModel: 'HYTE Y70', inputKey, boxes: [{ slot: 'gpu', role: 'detail' }] });
    // The earlier try marked the old key, which does not shield the new one.
    markTried(oldKey);
    expect(layoutNeedsResolve(record(2, bare(oldKey)), oldKey, 'hyte-y70')).toBe(false);
    expect(layoutNeedsResolve(record(2, bare(oldKey)), newKey, 'hyte-y70')).toBe(true);
    // The resolve saves the new key (card still unplaced) and marks it; a reload finds nothing to do.
    markTried(newKey);
    expect(layoutNeedsResolve(record(3, bare(newKey)), newKey, 'hyte-y70')).toBe(false);
  });

  it('keeps a failed try out of storage, so the next load asks again', () => {
    const key = 'case=c|cpu=x|gpu=Unlisted Card|board=y';
    const bare = { caseModel: 'HYTE Y70', inputKey: key, boxes: [{ slot: 'gpu', role: 'detail' }] };
    markTried(key, true);
    expect(layoutNeedsResolve(record(2, bare), key, 'hyte-y70')).toBe(true);
  });

  it('needs none without a record, a key, or a case to lay out', () => {
    expect(layoutNeedsResolve(null, 'k1', 'hyte-y70')).toBe(false);
    expect(layoutNeedsResolve(record(0), null, 'hyte-y70')).toBe(false);
    expect(layoutNeedsResolve(record(0), 'k1', undefined)).toBe(false);
    expect(layoutNeedsResolve(record(0), 'k1', '')).toBe(false);
  });
});

describe('resolveOutcome', () => {
  const msg = (over: Partial<{ rev: number; saved: boolean; hasLayout: boolean; model: boolean }> = {}) => ({ rev: 2, saved: true, hasLayout: true, model: false, ...over });

  it('waits for the first message', () => {
    expect(resolveOutcome(null, record(0))).toBe('waiting');
  });

  it('fails when the service refused the write', () => {
    expect(resolveOutcome(msg({ saved: false }), record(2))).toBe('failed');
  });

  it('is done when Build resolved no layout (no case to draw)', () => {
    expect(resolveOutcome(msg({ hasLayout: false }), record(0))).toBe('done');
  });

  it('waits until Cooling holds the record the message names', () => {
    expect(resolveOutcome(msg({ rev: 3, model: true }), record(2, { caseModel: 'HYTE Y70' }))).toBe('waiting');
    expect(resolveOutcome(msg({ rev: 3, model: true }), null)).toBe('waiting');
  });

  it('waits for the case model of a case the view draws', () => {
    expect(resolveOutcome(msg({ model: false }), record(2, { caseModel: 'HYTE Y70' }))).toBe('waiting');
    expect(resolveOutcome(msg({ model: true }), record(2, { caseModel: 'HYTE Y70' }))).toBe('done');
    expect(resolveOutcome(msg({ model: false }), record(2, { caseModel: 'HYTE Y50' }))).toBe('waiting');
  });

  it('is done without the model for a case the view does not draw', () => {
    expect(resolveOutcome(msg({ model: false }), record(2, { caseModel: 'Lian Li O11 Dynamic' }))).toBe('done');
    expect(resolveOutcome(msg({ model: false }), record(2, {}))).toBe('done');
  });
});

describe('the keys tried this session', () => {
  beforeEach(() => resetTried());
  it('remembers a key until it is forgotten', () => {
    expect(hasTried('k')).toBe(false);
    markTried('k');
    expect(hasTried('k')).toBe(true);
    forgetTried('k');
    expect(hasTried('k')).toBe(false);
  });
});

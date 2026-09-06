import { describe, expect, it } from 'vitest';
import { clampEnergy, inViewFromEntries, parseReactionTrigger, resolveAvatarRenderMode, toBool } from '../ui/avatarProps';

describe('inViewFromEntries', () => {
  it('takes the newest record of a batch, not the first', () => {
    expect(inViewFromEntries([{ isIntersecting: false }, { isIntersecting: true }], false)).toBe(true);
    expect(inViewFromEntries([{ isIntersecting: true }, { isIntersecting: false }], true)).toBe(false);
  });

  it('keeps the previous state for an empty batch', () => {
    expect(inViewFromEntries([], true)).toBe(true);
    expect(inViewFromEntries([], false)).toBe(false);
  });
});

describe('resolveAvatarRenderMode', () => {
  it('preview always wins, even with a valid pack', () => {
    expect(resolveAvatarRenderMode(true, '/packs/sample/')).toEqual({ kind: 'preview' });
    expect(resolveAvatarRenderMode(true, undefined)).toEqual({ kind: 'preview' });
  });

  it('empty when pack is missing, blank, or not a string', () => {
    expect(resolveAvatarRenderMode(false, undefined)).toEqual({ kind: 'empty' });
    expect(resolveAvatarRenderMode(false, '   ')).toEqual({ kind: 'empty' });
    expect(resolveAvatarRenderMode(false, 42)).toEqual({ kind: 'empty' });
  });

  it('live with the trimmed pack URL otherwise', () => {
    expect(resolveAvatarRenderMode(false, '/packs/sample/')).toEqual({ kind: 'live', pack: '/packs/sample/' });
    expect(resolveAvatarRenderMode(false, 'https://cdn.example/sample.nxpack')).toEqual({
      kind: 'live',
      pack: 'https://cdn.example/sample.nxpack',
    });
  });
});

describe('toBool', () => {
  it('coerces to a boolean', () => {
    expect(toBool(true)).toBe(true);
    expect(toBool(undefined)).toBe(false);
    expect(toBool(0)).toBe(false);
    expect(toBool(1)).toBe(true);
  });
});

describe('clampEnergy', () => {
  it('clamps into 0..1', () => {
    expect(clampEnergy(0.5)).toBe(0.5);
    expect(clampEnergy(-1)).toBe(0);
    expect(clampEnergy(2)).toBe(1);
  });

  it('falls back to 0 for non-finite or non-number input', () => {
    expect(clampEnergy(undefined)).toBe(0);
    expect(clampEnergy(Number.NaN)).toBe(0);
    expect(clampEnergy(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampEnergy('0.5')).toBe(0);
  });
});

describe('parseReactionTrigger', () => {
  it('strips the "#seq" suffix', () => {
    expect(parseReactionTrigger('Wave#3')).toBe('Wave');
    expect(parseReactionTrigger('Wave#0')).toBe('Wave');
  });

  it('keeps a "#" inside the trigger name, splitting on the last one', () => {
    expect(parseReactionTrigger('Multi#Word#12')).toBe('Multi#Word');
  });

  it('rejects malformed input', () => {
    expect(parseReactionTrigger('Wave')).toBeNull();
    expect(parseReactionTrigger('#3')).toBeNull();
    expect(parseReactionTrigger('Wave#')).toBeNull();
    expect(parseReactionTrigger('Wave#3a')).toBeNull();
    expect(parseReactionTrigger('')).toBeNull();
    expect(parseReactionTrigger(undefined)).toBeNull();
    expect(parseReactionTrigger(42)).toBeNull();
  });
});

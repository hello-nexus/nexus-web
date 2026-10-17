import { describe, expect, it, vi } from 'vitest';
import { customEffectDef, customEffectId, customEffectKey, isCustomEffectKey, type CustomEffectEntry } from './customEffects';

const t = (key: string) => key.split('.').pop()!;

const entry = (recipe: unknown): CustomEffectEntry => ({
  id: 'fx1', name: 'Mine', recipe: typeof recipe === 'string' ? recipe : JSON.stringify(recipe), updatedAt: 1, audio: true,
});

describe('custom effect keys', () => {
  it('round-trips an id through the key', () => {
    expect(customEffectKey('fx1')).toBe('custom:fx1');
    expect(customEffectId('custom:fx1')).toBe('fx1');
    expect(isCustomEffectKey('custom:fx1')).toBe(true);
    expect(isCustomEffectKey('plasma')).toBe(false);
    expect(isCustomEffectKey(null)).toBe(false);
  });
});

describe('customEffectDef', () => {
  it('turns pinned knobs into params named like the studio compiler uniforms', () => {
    const def = customEffectDef(entry({
      blocks: [{ uid: 'babc1', type: 'wipe' }, { uid: 'bdef2', type: 'colors' }],
      knobs: [{ uid: 'babc1', key: 'speed' }, { uid: 'babc1', key: 'softness' }],
    }), t);
    expect(def.key).toBe('custom:fx1');
    expect(def.audio).toBe(true);
    expect(def.params).toEqual([
      { name: 'u_babc1_speed', label: 'wipe - speed' },
      { name: 'u_babc1_softness', label: 'wipe - softness' },
    ]);
  });

  it('names each sensor-driven param after the shader uniform that carries it', () => {
    const def = customEffectDef(entry({
      blocks: [
        { uid: 'bar1', type: 'fillbar', mods: { level: { source: 'sensor' }, softness: { source: 'sine' } } },
        { uid: 'BAD UID', type: 'fillbar', mods: { level: { source: 'sensor' } } },
      ],
    }), t);
    expect(def.sensors).toEqual([{ name: 'u_bar1_level_s', label: 'fillbar - level' }]);
    expect(customEffectDef(entry({ blocks: [{ uid: 'a1', type: 'rings' }] }), t).sensors).toEqual([]);
  });

  it('drops knobs for removed blocks or unsafe names, and survives an unreadable recipe', () => {
    const def = customEffectDef(entry({
      blocks: [{ uid: 'babc1', type: 'rings' }],
      knobs: [{ uid: 'gone', key: 'speed' }, { uid: 'babc1', key: 'x;y' }, { uid: 'BAD UID', key: 'speed' }],
    }), t);
    expect(def.params).toEqual([]);
    expect(customEffectDef(entry('{nope'), t).params).toEqual([]);
  });
});

describe('putCustomEffect', () => {
  it('surfaces the service rejection message from the ApiResponse envelope', async () => {
    vi.resetModules();
    vi.doMock('./service', () => ({
      fetchService: async () => [],
      deleteService: async () => null,
      authFetchWithStatus: async () => ({
        status: 400,
        response: new Response(JSON.stringify({ error: true, msg: 'loop bound too large' }), { status: 400 }),
      }),
    }));
    const { putCustomEffect, getCustomEffects } = await import('./customEffects');
    expect(await putCustomEffect('fx1', { name: 'a', recipe: '{}', frag: '' })).toEqual({ error: 'loop bound too large' });
    expect(getCustomEffects()).toEqual([]);
    vi.doUnmock('./service');
  });
});

describe('deleteCustomEffect', () => {
  it('keeps the entry listed when the service does not confirm the delete', async () => {
    vi.resetModules();
    vi.doMock('./service', () => ({
      fetchService: async () => [{ id: 'fx1', name: 'a', recipe: '{}', updatedAt: 1, audio: false }],
      deleteService: async () => null,
      authFetchWithStatus: async () => ({ status: 0, response: null }),
    }));
    const { deleteCustomEffect, getCustomEffects, refreshCustomEffects } = await import('./customEffects');
    await refreshCustomEffects();
    expect(await deleteCustomEffect('fx1')).toBe(false);
    expect(getCustomEffects().map(e => e.id)).toEqual(['fx1']);
    vi.doUnmock('./service');
  });

  it('survives a non-JSON list response from an older service', async () => {
    vi.resetModules();
    vi.doMock('./service', () => ({
      fetchService: async () => { throw new SyntaxError('Unexpected token <'); },
      deleteService: async () => null,
      authFetchWithStatus: async () => ({ status: 0, response: null }),
    }));
    const { refreshCustomEffects, customEffectsLoaded } = await import('./customEffects');
    await expect(refreshCustomEffects()).resolves.toBeUndefined();
    expect(customEffectsLoaded()).toBe(false);
    vi.doUnmock('./service');
  });
});

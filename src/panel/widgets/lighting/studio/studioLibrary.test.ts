import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeBlock, type StudioRecipe } from './studioCompiler';

const put = vi.fn();
let list: { id: string; name: string; recipe: string; updatedAt: number; audio: boolean }[] = [];

vi.mock('../../../../api/customEffects', () => ({
  STUDIO_UID_RE: /^[a-z0-9]{1,24}$/,
  customEffectKey: (id: string) => `custom:${id}`,
  getCustomEffects: () => list,
  useCustomEffects: () => list,
  refreshCustomEffects: async () => {},
  putCustomEffect: (...args: unknown[]) => put(...args),
  deleteCustomEffect: async () => {},
}));

const recipe = (): StudioRecipe => ({
  v: 1, blocks: [makeBlock('plasma'), makeBlock('palette')], speed: 50, hue: 0, saturation: 1, contrast: 1,
});

async function fresh() {
  vi.resetModules();
  return import('./studioLibrary');
}

describe('studioLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
    put.mockReset();
    put.mockResolvedValue({ entry: {} });
    list = [];
  });

  it('skips service entries whose recipe is malformed', async () => {
    const bad = recipe();
    bad.blocks[0].mods = { scale: { source: 'nope' as never, amount: 0.5 } };
    list = [
      { id: 'ok', name: 'ok', recipe: JSON.stringify(recipe()), updatedAt: 1, audio: false },
      { id: 'bad', name: 'bad', recipe: JSON.stringify(bad), updatedAt: 1, audio: false },
      { id: 'junk', name: 'junk', recipe: '{not json', updatedAt: 1, audio: false },
    ];
    const lib = await fresh();
    expect(lib.getSavedEffects().map(e => e.id)).toEqual(['ok']);
  });

  it('saves the baked shader and reports the service error', async () => {
    put.mockResolvedValueOnce({ error: 'fragment: 0:12 syntax error' });
    const lib = await fresh();
    const error = await lib.saveEffect('fx1', 'mine', recipe());
    expect(error).toBe('fragment: 0:12 syntax error');
    const [id, body] = put.mock.calls[0] as [string, { name: string; recipe: string; frag: string }];
    expect(id).toBe('fx1');
    expect(body.frag).toMatch(/^#version 330 core/);
    expect(body.frag).toContain('const float S_SPEED = 1.0;');
    expect(JSON.parse(body.recipe).v).toBe(1);
  });

  it('moves effects from browser storage into the service once, then clears them', async () => {
    localStorage.setItem('nexus.studio.saved', JSON.stringify([
      { id: 'fxold', name: 'old one', recipe: recipe() },
      { id: 'fxjunk', name: 'junk', recipe: { v: 2 } },
    ]));
    const lib = await fresh();
    await lib.migrateLegacyEffects();
    await lib.migrateLegacyEffects();
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe('fxold');
    expect(localStorage.getItem('nexus.studio.saved')).toBeNull();
  });

  it('keeps browser storage when a migration save fails', async () => {
    put.mockResolvedValueOnce({ error: 'HTTP 500' });
    localStorage.setItem('nexus.studio.saved', JSON.stringify([{ id: 'fxold', name: 'old one', recipe: recipe() }]));
    const lib = await fresh();
    await lib.migrateLegacyEffects();
    expect(localStorage.getItem('nexus.studio.saved')).not.toBeNull();
  });

  describe('parseMarketRecipe', () => {
    it('accepts a Studio recipe and keeps only knobs that name a real param', async () => {
      const lib = await fresh();
      const r = recipe();
      const uid = r.blocks[0].uid;
      r.knobs = [{ uid, key: 'scale' }, { uid, key: 'nope' }, { uid: 'missing', key: 'scale' }];
      expect(lib.parseMarketRecipe(r)?.knobs).toEqual([{ uid, key: 'scale' }]);
    });

    it('rejects recipes this build cannot run as the Studio would build them', async () => {
      const lib = await fresh();
      const unknown = recipe();
      unknown.blocks[0].type = 'hologram';
      const overStage = { ...recipe(), blocks: ['rings', 'stripes', 'plasma', 'dots', 'palette'].map(makeBlock) };
      const overBudget = { ...recipe(), blocks: ['warp', 'warp', 'warp', 'cells', 'palette'].map(makeBlock) };
      const dupUid = recipe();
      dupUid.blocks[1].uid = dupUid.blocks[0].uid;
      for (const r of [unknown, overStage, overBudget, dupUid, null, 'x', { v: 2 }]) expect(lib.parseMarketRecipe(r)).toBeNull();
    });

    it('accepts a rate only on a wave and a gate only on music, inside the API ranges', async () => {
      const lib = await fresh();
      const withMod = (mod: Record<string, unknown>) => {
        const r = recipe();
        r.blocks[0].mods = { speed: mod as never };
        return r;
      };
      expect(lib.parseMarketRecipe(withMod({ source: 'sine', amount: 0.5, rate: 1.5 }))).not.toBeNull();
      expect(lib.parseMarketRecipe(withMod({ source: 'bass', amount: 0.5, gate: 0.3 }))).not.toBeNull();
      for (const bad of [
        { source: 'bass', amount: 0.5, rate: 1 },
        { source: 'sine', amount: 0.5, gate: 0.2 },
        { source: 'square', amount: 0.5, rate: 9 },
        { source: 'level', amount: 0.5, gate: 0.95 },
        { source: 'saw', amount: 0.5 },
      ]) expect(lib.parseMarketRecipe(withMod(bad))).toBeNull();
    });

    it('accepts the sensor source with a valid binding and nothing else on it', async () => {
      const lib = await fresh();
      const sensor = { category: 'quick', sensor: 'summary/cpu-temp', min: 30, max: 95 };
      const withMod = (mod: Record<string, unknown>) => {
        const r = recipe();
        r.blocks[0].mods = { speed: mod as never };
        return r;
      };
      expect(lib.parseMarketRecipe(withMod({ source: 'sensor', amount: 1, sensor }))).not.toBeNull();
      for (const bad of [
        { source: 'sensor', amount: 1 },
        { source: 'sensor', amount: 1, sensor: { ...sensor, min: 95, max: 30 } },
        { source: 'sensor', amount: 1, sensor: { ...sensor, sensor: 'a"b' } },
        { source: 'sensor', amount: 1, sensor, rate: 1 },
        { source: 'sensor', amount: 1, sensor, gate: 0.2 },
        { source: 'bass', amount: 1, sensor },
        { source: 'sine', amount: 1, rate: 1, sensor },
      ]) expect(lib.parseMarketRecipe(withMod(bad)), JSON.stringify(bad)).toBeNull();
    });
  });

  it('sends the Marketplace link with the save only when given', async () => {
    const lib = await fresh();
    await lib.saveEffect('fx1', 'one', recipe());
    await lib.saveEffect('fx1', 'one', recipe(), { marketId: 'm1', marketAuthor: 'alice' });
    expect(put.mock.calls[0][1]).not.toHaveProperty('marketId');
    expect(put.mock.calls[1][1]).toMatchObject({ marketId: 'm1', marketAuthor: 'alice' });
  });

  it('names a copy apart from the effects you have, within the name cap', async () => {
    const lib = await fresh();
    expect(lib.copyName('Aurora', ['Weird Warp'])).toBe('Aurora');
    expect(lib.copyName('Aurora', ['aurora', 'Aurora 2'])).toBe('Aurora 3');
    const long = 'x'.repeat(lib.EFFECT_NAME_MAX);
    const next = lib.copyName(long, [long]);
    expect(next.length).toBeLessThanOrEqual(lib.EFFECT_NAME_MAX);
    expect(next.endsWith(' 2')).toBe(true);
    // An emoji at the cap is dropped whole, never cut in half.
    const emoji = lib.copyName(`${'x'.repeat(lib.EFFECT_NAME_MAX - 1)}\u{1F600}`, []);
    expect(emoji).toBe('x'.repeat(lib.EFFECT_NAME_MAX - 1));
  });
});


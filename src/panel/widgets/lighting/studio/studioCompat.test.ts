import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STUDIO_BLOCKS, studioBlock } from './studioBlocks';
import { STUDIO_MOD_SOURCES, compileStudio, makeBlock, type StudioBlock, type StudioRecipe } from './studioCompiler';
import { parseMarketRecipe } from './studioLibrary';
import { STUDIO_STARTERS } from './studioRecipes';

// Published effects are recipes that every PC compiles with its own block
// catalog, so a shipped recipe must compile to the same shader forever. Each
// frozen case below must keep its exact baked GLSL. A failure means an existing
// block, helper or the compiler changed what a shared effect looks like: ship
// the change as a new block type (studioBlocks.ts) instead, including a new
// param on an existing block. Edit a case's hash by hand only for a change
// rendered side by side and confirmed identical.
// STUDIO_COMPAT_WRITE=1 adds cases for new blocks, starters and mod sources;
// it never rewrites an existing case.

const SENSOR = { category: 'quick', sensor: 'summary/cpu-usage', min: 0, max: 100 };

const FIXTURE = resolve(__dirname, 'studioCompat.fixture.json');

interface CompatCase {
  recipe: StudioRecipe;
  sha256: string;
}

const hashOf = (recipe: StudioRecipe) =>
  createHash('sha256').update(compileStudio(recipe, { bake: true }).frag).digest('hex');

// An install compiles what the Marketplace import returns, not the raw recipe.
const installedHash = (recipe: StudioRecipe) => {
  const parsed = parseMarketRecipe(recipe);
  return parsed ? hashOf(parsed) : null;
};

// Fixed uids, so the uniform names in the shader do not depend on when the case was made.
function frozen(types: string[], tweak = true): StudioRecipe {
  const blocks: StudioBlock[] = types.map((type, i) => {
    const b = makeBlock(type);
    b.uid = `k${i}`;
    if (!tweak) return b;
    for (const p of studioBlock(type)?.params ?? []) {
      const raw = p.options ? p.options.length - 1 : p.min + (p.max - p.min) * 0.37;
      b.params[p.key] = Math.round(raw / p.step) * p.step;
    }
    if (b.colors) for (const key of Object.keys(b.colors)) b.colors[key] = [0.2, 0.6, 0.9];
    return b;
  });
  return { v: 1, blocks, speed: 73, hue: 0.21, saturation: 1.3, contrast: 0.8 };
}

function withFixedUids(recipe: StudioRecipe): StudioRecipe {
  const uid = new Map(recipe.blocks.map((b, i) => [b.uid, `k${i}`]));
  return {
    ...recipe,
    blocks: recipe.blocks.map(b => ({ ...b, uid: uid.get(b.uid)! })),
    knobs: recipe.knobs?.map(k => ({ ...k, uid: uid.get(k.uid)! })),
  };
}

function expectedCases(): Record<string, () => StudioRecipe> {
  const cases: Record<string, () => StudioRecipe> = {};
  for (const def of STUDIO_BLOCKS) {
    const types = def.stage === 'pattern' ? [def.type, 'palette']
      : def.stage === 'color' ? ['plasma', def.type]
        : ['plasma', def.type, 'palette'];
    cases[`block:${def.type}`] = () => frozen(types);
    // A recipe saved before a param or colour existed: the block's defaults fill in.
    cases[`bare:${def.type}`] = () => {
      const r = frozen(types, false);
      const b = r.blocks.find(x => x.type === def.type)!;
      b.params = {};
      delete b.colors;
      return r;
    };
    if (def.stage === 'pattern') cases[`blend:${def.type}`] = () => frozen(['plasma', def.type, 'palette']);
  }
  for (const s of STUDIO_STARTERS) cases[`starter:${s.id}`] = () => withFixedUids(s.build());
  cases['mod:bass:gate'] = () => {
    const r = frozen(['rings', 'palette'], false);
    r.blocks[0].mods = { speed: { source: 'bass', amount: 0.4, gate: 0.3 } };
    return r;
  };
  cases['mod:sine:rate'] = () => {
    const r = frozen(['rings', 'palette'], false);
    r.blocks[0].mods = { speed: { source: 'sine', amount: -0.6, rate: 1.5 } };
    return r;
  };
  for (const source of STUDIO_MOD_SOURCES) {
    cases[`mod:${source}`] = () => {
      const r = frozen(['rings', 'palette'], false);
      const key = studioBlock('rings')!.params.find(p => !p.options)!.key;
      r.blocks[0].mods = { [key]: { source, amount: 0.4, ...(source === 'sensor' ? { sensor: SENSOR } : {}) } };
      return r;
    };
  }
  return cases;
}

const load = (): Record<string, CompatCase> => (existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {});

describe('Studio recipe compatibility', () => {
  const fixture = load();

  it('covers every block, blend, starter and audio mod source', () => {
    const missing = Object.keys(expectedCases()).filter(k => !fixture[k]);
    if (missing.length && process.env.STUDIO_COMPAT_WRITE === '1') {
      const all = expectedCases();
      for (const k of missing) {
        const recipe = all[k]();
        fixture[k] = { recipe, sha256: installedHash(recipe)! };
      }
      const sorted = Object.fromEntries(Object.keys(fixture).sort().map(k => [k, fixture[k]]));
      writeFileSync(FIXTURE, `${JSON.stringify(sorted, null, 2)}\n`);
      return;
    }
    expect(missing, 'new cases: run with STUDIO_COMPAT_WRITE=1 to add them').toEqual([]);
  });

  it.each(Object.entries(fixture))('%s still compiles to the shader it shipped with', (_name, c) => {
    expect(installedHash(c.recipe), 'the Marketplace import must still accept it and compile it unchanged').toBe(c.sha256);
  });
});

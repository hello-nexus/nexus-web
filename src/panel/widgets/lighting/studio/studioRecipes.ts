import {
  PATTERN_BLEND_PARAMS, STUDIO_COST_BUDGET, STUDIO_STAGE_LIMIT, blocksForStage, studioBlock,
  type StudioParam, type StudioStage,
} from './studioBlocks';
import { makeBlock, recipeCost, stageCount, type StudioBlock, type StudioRecipe } from './studioCompiler';
import { SENSOR_PREMADES, starterRecipe } from './studioSensorPremades';

type BlockSpec = [type: string, params?: Record<string, number>, colors?: Record<string, [number, number, number]>];

/** `knobs` pin params by block index and key. */
function recipe(specs: BlockSpec[], knobs: [number, string][] = []): StudioRecipe {
  const blocks = specs.map(([type, params, colors]) => {
    const b = makeBlock(type);
    Object.assign(b.params, params);
    if (colors) b.colors = { ...b.colors, ...colors };
    return b;
  });
  return {
    v: 1, blocks, speed: 50, hue: 0, saturation: 1, contrast: 1,
    knobs: knobs.map(([i, key]) => ({ uid: blocks[i].uid, key })),
  };
}

const RED: [number, number, number] = [1, 0.1, 0.3];
const BLUE: [number, number, number] = [0.1, 0.4, 1];
const CYAN: [number, number, number] = [0, 0.9, 1];
const GOLD: [number, number, number] = [1, 0.7, 0.2];
// Two-color wipes: the spread puts v's top end exactly on c2 of the three-stop gradient.
const twoColors = (a: [number, number, number], b: [number, number, number]): BlockSpec =>
  ['colors', { spread: 0.333, shade: 0 }, { c1: a, c2: b, c3: a }];

export interface StudioStarter {
  id: string;
  build: () => StudioRecipe;
}

export const STUDIO_STARTERS: readonly StudioStarter[] = [
  {
    id: 'colorCycle',
    build: () => recipe([['solid'], ['palette', { palette: 0, cycle: 1, shade: 0 }]], [[1, 'cycle']]),
  },
  {
    id: 'breathing',
    build: () => recipe(
      [['solid'], ['colors', { spread: 0, shade: 0 }, { c1: CYAN, c2: CYAN, c3: CYAN }], ['pulse', { rate: 0.6, depth: 0.9 }]],
      [[2, 'rate'], [2, 'depth']],
    ),
  },
  {
    id: 'horizontalWipe',
    build: () => recipe([['wipe', { shape: 0, angle: 0 }], twoColors(RED, BLUE)], [[0, 'speed'], [0, 'softness']]),
  },
  {
    id: 'verticalWipe',
    build: () => recipe([['wipe', { shape: 0, angle: 90 }], twoColors(RED, BLUE)], [[0, 'speed'], [0, 'softness']]),
  },
  {
    id: 'radialFill',
    build: () => recipe([['wipe', { shape: 1 }], twoColors(CYAN, [1, 0.2, 0.8])], [[0, 'speed'], [0, 'softness']]),
  },
  {
    id: 'clockWipe',
    build: () => recipe([['wipe', { shape: 2 }], twoColors([1, 0.6, 0], [0.5, 0, 1])], [[0, 'speed'], [0, 'softness']]),
  },
  {
    id: 'rainbowWheel',
    build: () => recipe([['sweep', { tail: 1, speed: 0.5 }], ['palette', { palette: 0, spread: 1, shade: 0 }]], [[0, 'speed'], [0, 'count']]),
  },
  {
    id: 'fanSpinner',
    build: () => recipe([
      ['spiral', { arms: 3, twist: 0, speed: 2 }],
      ['threshold', { level: 0.6, softness: 0.1 }],
      ['palette', { palette: 3, spread: 0.5, shade: 1 }],
      ['glow', { amount: 0.5 }],
    ], [[0, 'arms'], [0, 'speed']]),
  },
  {
    id: 'larsonScanner',
    build: () => recipe([['scanner'], ['colors', { spread: 0, shade: 1 }, { c1: RED, c2: RED, c3: RED }]], [[0, 'speed'], [0, 'tail']]),
  },
  {
    id: 'theaterChase',
    build: () => recipe([['chase'], ['colors', { spread: 0, shade: 1 }, { c1: GOLD, c2: GOLD, c3: GOLD }]], [[0, 'count'], [0, 'speed']]),
  },
  {
    id: 'campfire',
    build: () => recipe([['flame'], ['palette', { palette: 4, shade: 1 }]], [[0, 'size'], [0, 'speed']]),
  },
  {
    id: 'cometOrbit',
    build: () => recipe([
      ['sweep', { speed: 1.5, tail: 6 }],
      ['shape', { sides: 2, size: 0.7, glow: 8, blend: 1, mix: 1 }],
      ['palette', { palette: 4, shade: 1 }],
      ['glow', { amount: 1 }],
    ], [[0, 'speed'], [0, 'tail']]),
  },
  {
    id: 'spectrumBars',
    build: () => recipe([['spectrum'], ['palette', { palette: 0, spread: 1.4, shade: 1 }]], [[0, 'count'], [0, 'gain']]),
  },
  {
    id: 'vuMeter',
    build: () => recipe(
      // The three-stop gradient is cyclic: two thirds of it runs green to red without wrapping back.
      [['vu', { shape: 2 }], ['colors', { spread: 0.667, shade: 1 }, { c1: [0.1, 1, 0.3], c2: GOLD, c3: RED }]],
      [[0, 'source'], [0, 'gain']],
    ),
  },
  {
    id: 'beatRings',
    build: () => recipe([
      ['beatrings'],
      ['palette', { palette: 3, spread: 0.6, shade: 1 }],
      ['glow', { amount: 0.6 }],
    ], [[0, 'size'], [0, 'count']]),
  },
  {
    id: 'pulseRings',
    build: () => recipe([
      ['rings', { count: 3, speed: 2 }],
      ['threshold', { level: 0.75, softness: 0.05 }],
      ['palette', { palette: 2, shade: 1 }],
    ], [[0, 'count'], [0, 'speed']]),
  },
  {
    id: 'radar',
    build: () => recipe([
      ['sweep', { speed: 1, tail: 5 }],
      ['rings', { count: 5, speed: 0, blend: 2, mix: 0.25 }],
      ['palette', { palette: 5, spread: 0.4, shade: 1 }],
      ['vignette', { amount: 0.3 }],
    ], [[0, 'speed']]),
  },
  {
    id: 'neonKaleido',
    build: () => recipe([
      ['kaleidoscope', { sides: 8, spin: 0.1 }],
      ['shape', { sides: 6, size: 0.5, glow: 12 }],
      ['rings', { count: 6, speed: 1, blend: 2, mix: 0.6 }],
      ['palette', { palette: 3, spread: 1.2, shade: 0.8 }],
      ['glow', { amount: 0.6 }],
      ['vignette', { amount: 0.5 }],
    ], [[0, 'sides'], [2, 'speed']]),
  },
  {
    id: 'lavaLamp',
    build: () => recipe([
      ['warp', { amount: 0.6, scale: 1.2, speed: 0.3 }],
      ['clouds', { scale: 1.5, speed: 0.2 }],
      ['threshold', { level: 0.58, softness: 0.12 }],
      ['palette', { palette: 4, spread: 0.9, shade: 0.85 }],
      ['glow', { amount: 0.4 }],
    ], [[0, 'speed'], [2, 'level']]),
  },
  {
    id: 'hypnoTunnel',
    build: () => recipe([
      ['tunnel', { depth: 0.5, speed: 1.2, twist: 0.5 }],
      ['checker', { count: 4 }],
      ['palette', { palette: 3, spread: 1, cycle: 0.6, shade: 0.5 }],
      ['vignette', { amount: 0.9 }],
    ], [[0, 'speed'], [1, 'count']]),
  },
  {
    id: 'oceanCaustics',
    build: () => recipe([
      ['bend', { amount: 0.3, frequency: 2.5, speed: 0.6 }],
      ['cells', { scale: 5, speed: 0.6, style: 1 }],
      ['invert', { amount: 1 }],
      ['sharpen', { power: 3 }],
      ['palette', { palette: 2, shade: 0.7 }],
      ['glow', { amount: 0.8 }],
    ], [[1, 'speed'], [0, 'amount']]),
  },
  {
    id: 'discoGrid',
    build: () => recipe([
      ['spin', { speed: 0.15 }],
      ['dots', { count: 10, size: 0.32, speed: 2 }],
      ['palette', { palette: 6, cycle: 0.5, shade: 0.9 }],
      ['glow', { amount: 0.5 }],
    ], [[1, 'count'], [0, 'speed']]),
  },
  {
    id: 'aurora',
    build: () => recipe([
      ['zoom', { scale: 0.8 }],
      ['bend', { amount: 0.4, frequency: 1.5, speed: 0.5 }],
      ['lines', { count: 3, wobble: 0.8, glow: 6, speed: 0.7 }],
      ['clouds', { scale: 1.2, speed: 0.2, blend: 0, mix: 0.4 }],
      ['palette', { palette: 5, spread: 0.7, shade: 0.9 }],
      ['glow', { amount: 1 }],
      ['vignette', { amount: 0.4 }],
    ], [[2, 'wobble'], [1, 'speed']]),
  },
  {
    id: 'starWarp',
    build: () => recipe([
      ['swirl', { amount: 2, size: 1.5 }],
      ['sparkle', { density: 20, amount: 0.5, speed: 1.5 }],
      ['palette', { palette: 7, shade: 1 }],
      ['glow', { amount: 1.5 }],
    ], [[1, 'density'], [0, 'amount']]),
  },
  {
    id: 'retroBands',
    build: () => recipe([
      ['ripple', { amount: 0.05, frequency: 10, speed: 1 }],
      ['plasma', { scale: 4, speed: 0.8 }],
      ['bands', { steps: 6 }],
      ['colors', { spread: 1, shade: 0.4 }, { c1: [1, 0.3, 0.1], c2: [1, 0.85, 0.2], c3: [0.6, 0.1, 0.6] }],
      ['scanlines', { count: 120, amount: 0.3 }],
      ['grain', { amount: 0.05 }],
    ], [[2, 'steps'], [1, 'speed']]),
  },
  ...SENSOR_PREMADES.map(p => ({ id: p.starterId, build: () => starterRecipe(p) })),
];

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length;

function snap(p: StudioParam, value: number): number {
  const v = Math.min(p.max, Math.max(p.min, value));
  const snapped = p.min + Math.round((v - p.min) / p.step) * p.step;
  return Number(Math.min(p.max, snapped).toFixed(decimals(p.step)));
}

/** Triangular around the default so random picks stay near the authored look. */
function randomParam(p: StudioParam): number {
  if (p.options) return Math.floor(Math.random() * p.options.length);
  return snap(p, p.def + (Math.random() - Math.random()) * (p.max - p.min) * 0.5);
}

function randomColor(): [number, number, number] {
  const h = Math.random();
  const k = (n: number) => {
    const x = (n + h * 6) % 6;
    return 1 - Math.max(0, Math.min(1, Math.min(x, 4 - x)));
  };
  return [k(5), k(3), k(1)];
}

function randomBlock(type: string): StudioBlock {
  const def = studioBlock(type)!;
  const b = makeBlock(type);
  for (const p of def.params) b.params[p.key] = randomParam(p);
  if (def.stage === 'pattern') {
    b.params.blend = Math.floor(Math.random() * 6);
    b.params.mix = snap(PATTERN_BLEND_PARAMS[1], 0.4 + Math.random() * 0.6);
  }
  if (def.colors) b.colors = Object.fromEntries(def.colors.map(c => [c.key, randomColor()]));
  return b;
}

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

function canAdd(r: StudioRecipe, type: string): boolean {
  const def = studioBlock(type);
  if (!def) return false;
  return stageCount(r, def.stage) < STUDIO_STAGE_LIMIT[def.stage]
    && recipeCost(r) + def.cost <= STUDIO_COST_BUDGET;
}

function addRandom(r: StudioRecipe, stage: StudioStage): void {
  const options = blocksForStage(stage).filter(d => canAdd(r, d.type) && !r.blocks.some(b => b.type === d.type));
  if (options.length) r.blocks.push(randomBlock(pick(options).type));
}

/** A new effect built from scratch: random blocks, params and colors. */
export function randomRecipe(): StudioRecipe {
  const color = randomBlock(Math.random() < 0.8 ? 'palette' : 'colors');
  color.params.shade = snap(studioBlock(color.type)!.params.find(p => p.key === 'shade')!, 0.4 + Math.random() * 0.6);
  // The color block goes in first so the budget checks below count it.
  const r: StudioRecipe = { v: 1, blocks: [color], speed: 50, hue: 0, saturation: 1, contrast: 1 };
  const counts: [StudioStage, readonly number[]][] = [
    ['pattern', [1, 1, 2]], ['space', [0, 1, 1, 2]], ['tone', [0, 0, 1]], ['finish', [0, 1, 2]],
  ];
  for (const [stage, choices] of counts) {
    const n = pick(choices);
    for (let i = 0; i < n; i++) addRandom(r, stage);
  }
  return r;
}

/** A nearby variation: nudged params plus, sometimes, one structural change. */
export function mutateRecipe(source: StudioRecipe): StudioRecipe {
  const r: StudioRecipe = structuredClone(source);
  for (const b of r.blocks) {
    const def = studioBlock(b.type);
    if (!def) continue;
    for (const p of def.params) {
      if (p.options) {
        if (Math.random() < 0.15) b.params[p.key] = randomParam(p);
      } else if (Math.random() < 0.6) {
        const base = b.params[p.key] ?? p.def;
        b.params[p.key] = snap(p, base + (Math.random() - Math.random()) * (p.max - p.min) * 0.2);
      }
    }
    if (def.colors && Math.random() < 0.3) {
      const c = pick(def.colors);
      b.colors = { ...b.colors, [c.key]: randomColor() };
    }
  }
  if (Math.random() < 0.4) {
    const roll = Math.random();
    const removable = r.blocks.filter(b => {
      const stage = studioBlock(b.type)?.stage;
      return stage !== 'color' && !(stage === 'pattern' && stageCount(r, 'pattern') === 1);
    });
    if (roll < 0.4) {
      addRandom(r, pick<StudioStage>(['space', 'pattern', 'tone', 'finish']));
    } else if (roll < 0.7 && removable.length) {
      const victim = pick(removable);
      r.blocks = r.blocks.filter(b => b !== victim);
    } else {
      const target = pick(r.blocks);
      const stage = studioBlock(target.type)!.stage;
      const others = blocksForStage(stage).filter(d => d.type !== target.type);
      const replacement = others.length ? randomBlock(pick(others).type) : null;
      if (replacement) {
        const without = { ...r, blocks: r.blocks.filter(b => b !== target) };
        if (canAdd(without, replacement.type)) {
          replacement.mods = undefined;
          r.blocks = r.blocks.map(b => (b === target ? replacement : b));
        }
      }
    }
  }
  return r;
}

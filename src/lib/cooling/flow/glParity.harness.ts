import { Color, Group, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { CpuFlow } from './cpuSolver';
import { caseWithGpuAndShroud, defaultDir, fronts, inputFor, rear } from './flowFixtures';
import { FlowLayer } from './flowLayer';
import { GlFlow, floatSupport } from './glFlow';
import { buildFlowScene } from './gridScene';

declare global { interface Window { __flowGl: Record<string, unknown> } }

const FRAMES = Number(new URLSearchParams(location.search).get('frames') ?? 500);
const out: Record<string, unknown> = {};
const errors: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ').slice(0, 400)); origError(...a); };

function bad(layer: FlowLayer): { checked: number; badCount: number } {
  const fs = layer.scene!;
  const [NX, NY, NZ] = fs.dims;
  const { pos } = layer.readParticles();
  let checked = 0;
  let badCount = 0;
  for (let i = 0; i < pos.length / 4; i++) {
    const x = pos[i * 4], y = pos[i * 4 + 1], z = pos[i * 4 + 2];
    if (x < -1e5) continue;
    checked++;
    const ci = Math.floor(x + 0.5), cj = Math.floor(y + 0.5), ck = Math.floor(z + 0.5);
    if (ci < 0 || cj < 0 || ck < 0 || ci >= NX || cj >= NY || ck >= NZ || fs.solid[ci + NX * (cj + NY * ck)]) badCount++;
  }
  return { checked, badCount };
}

const trail: string[] = [];
async function main() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true });
  const err = (label: string) => { const e = renderer.getContext().getError(); if (e) trail.push(`${label}:${e}`); };
  const kind = floatSupport(renderer);
  err('floatSupport');
  out.float32 = kind === 1015;
  out.supported = kind !== null;
  if (kind === null) return;
  const input = caseWithGpuAndShroud();
  const scene = buildFlowScene(input, 32 * 24 * 48);
  const gl = new GlFlow(renderer, scene, kind);
  const cpu = new CpuFlow(scene);
  err('construct');
  for (let i = 0; i < 60; i++) { gl.step(1); cpu.step(); }
  err('steps');
  const g = gl.readVelocity();
  err('readVelocity');
  let maxDiff = 0;
  let maxCpu = 0;
  for (let i = 0; i < cpu.u.length; i++) { maxDiff = Math.max(maxDiff, Math.abs(g[i] - cpu.u[i])); maxCpu = Math.max(maxCpu, Math.abs(cpu.u[i])); }
  out.velocity = { maxDiff, maxCpu };
  gl.beginMeasure();
  let measured = gl.pollMeasure();
  while (!measured) { await new Promise(r => requestAnimationFrame(r)); measured = gl.pollMeasure(); }
  out.measure = measured;
  err('measure');

  const host = new Group();
  const layer = new FlowLayer(renderer, host, new Vector3(480, 440, 360), {
    cool: new Color('#38bdf8'), warm: new Color('#f59e0b'), hot: new Color('#ef4444'), collision: new Color('#ef4444'), porous: new Color('#38bdf8'),
  });
  const sc = new Scene();
  sc.add(host);
  const cam = new PerspectiveCamera(40, 4 / 3, 1, 5000);
  cam.position.set(900, 650, 900);
  cam.lookAt(240, 220, 180);
  layer.setInput(input);
  const q = new URLSearchParams(location.search);
  layer.setOptions({ particles: q.get('p') !== '0', collisions: false, speed: 1.5 });
  let worst = 0;
  let checked = 0;
  for (let f = 0; f < FRAMES; f++) {
    layer.frame(performance.now(), cam, 240);
    err(`frame${f}`);
    renderer.render(sc, cam);
    err(`render${f}`);
    if (f % 25 === 24) { const r = bad(layer); worst += r.badCount; checked += r.checked; }
    if (f % 50 === 0) await new Promise(r => setTimeout(r, 0));
  }
  out.particles = { checked, inSolidOrOutside: worst, tier: layer.currentTier, timing: layer.timingMode };

  layer.dropTier();
  let afterWorst = 0;
  let afterChecked = 0;
  for (let f = 0; f < 120; f++) {
    layer.frame(performance.now(), cam, 240);
    renderer.render(sc, cam);
    if (f % 20 === 19) { const r = bad(layer); afterWorst += r.badCount; afterChecked += r.checked; }
  }
  out.afterTierDrop = { checked: afterChecked, inSolidOrOutside: afterWorst, tier: layer.currentTier, dims: layer.scene!.dims };
  layer.dispose();

  // What the user sees: per-frame displacement of the particles within one fan diameter downstream of a slow and a fast fan on one face.
  const pair = inputFor([fronts[0], fronts[1], rear], [], defaultDir, 60);
  // A rear exhaust takes what the two intakes bring, so neither intake is blocked by the other.
  pair.fanCfm = { [fronts[0].key]: 33.6, [fronts[1].key]: 60, [rear.key]: 93.6 };
  pair.referenceCfm = 60;
  const host2 = new Group();
  const sc2 = new Scene();
  sc2.add(host2);
  const slowFast = new FlowLayer(renderer, host2, new Vector3(480, 440, 360), {
    cool: new Color('#38bdf8'), warm: new Color('#f59e0b'), hot: new Color('#ef4444'), collision: new Color('#ef4444'), porous: new Color('#38bdf8'),
  });
  slowFast.setInput(pair);
  slowFast.setOptions({ particles: true, collisions: false, speed: 1.5 });
  const fs2 = slowFast.scene!;
  const centres: number[][] = [];
  const e = fs2.emitters;
  for (let o = 0; o < e.length; o += 12) if (!centres.some(c => c[0] === e[o] && c[1] === e[o + 1] && c[2] === e[o + 2])) centres.push([e[o], e[o + 1], e[o + 2], e[o + 4], e[o + 5], e[o + 6], e[o + 7]]);
  const sums = centres.map(() => 0);
  const counts = centres.map(() => 0);
  let prev: Float32Array | null = null;
  // Warm up until the solver reports a steady field and the pool has lived through its birth spread, then measure.
  let framesToSteady = 0;
  while (!slowFast.settled && framesToSteady < 4000) {
    slowFast.frame(performance.now(), cam, 240);
    renderer.render(sc2, cam);
    framesToSteady++;
    if (framesToSteady % 50 === 0) await new Promise(r => setTimeout(r, 0));
  }
  for (let f = 0; f < 200; f++) { slowFast.frame(performance.now(), cam, 240); renderer.render(sc2, cam); }
  for (let f = 0; f < 100; f++) {
    slowFast.frame(performance.now(), cam, 240);
    renderer.render(sc2, cam);
    const { pos } = slowFast.readParticles();
    if (prev) {
      for (let i = 0; i < pos.length / 4; i++) {
        if (pos[i * 4] < -1e5 || pos[i * 4 + 3] <= 0 || prev[i * 4 + 3] <= 0) continue;
        const d = Math.hypot(pos[i * 4] - prev[i * 4], pos[i * 4 + 1] - prev[i * 4 + 1], pos[i * 4 + 2] - prev[i * 4 + 2]);
        if (d >= 3) continue;
        centres.forEach((c, n) => {
          const rel = [prev![i * 4] - c[0], prev![i * 4 + 1] - c[1], prev![i * 4 + 2] - c[2]];
          const along = rel[0] * c[3] + rel[1] * c[4] + rel[2] * c[5];
          const radial = Math.hypot(rel[0] - along * c[3], rel[1] - along * c[4], rel[2] - along * c[5]);
          if (along > 0 && along <= 2 * c[6] && radial <= c[6]) { sums[n] += d; counts[n]++; }
        });
      }
    }
    prev = pos;
  }
  out.visibleSpeed = { centres: centres.length, means: sums.map((s, n) => (counts[n] ? s / counts[n] : 0)), counts, tier: slowFast.currentTier, framesToSteady, settled: slowFast.settled };
  slowFast.dispose();
  out.glError = renderer.getContext().getError();
  out.trail = trail.slice(0, 8);
  gl.dispose();
  renderer.forceContextLoss();
}

main().catch(e => { out.exception = String(e) + ((e as Error).stack ?? ''); }).finally(() => {
  out.consoleErrors = errors;
  window.__flowGl = out;
  document.title = 'done';
});

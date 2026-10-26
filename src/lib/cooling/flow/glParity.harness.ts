import { Color, DataTexture, FloatType, Group, RGBAFormat, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { CpuFlow } from './cpuSolver';
import { caseWithGpuAndShroud, defaultDir, fronts, gpuBox, inputFor, rear } from './flowFixtures';
import { FlowLayer } from './flowLayer';
import { GlFlow, PassRunner, floatSupport, pass, target } from './glFlow';
import { STREAK_PARITY } from './shaders';
import { stepDisplacement, streakOf } from './streak';
import { buildFlowScene } from './gridScene';
import { EMITTER_STRIDE } from './flowParams';

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
  // Buoyancy and the temperature field: the same hot GPU on both, more steps, then compare the temperature and the velocity it bends.
  gl.setTemps({ gpu: 75, cpu: null });
  cpu.setTemps({ gpu: 75, cpu: null });
  for (let i = 0; i < 80; i++) { gl.step(1); cpu.step(); }
  const gt = gl.readTemperature();
  const gv = gl.readVelocity();
  let tDiff = 0;
  let tMax = 0;
  for (let i = 0; i < cpu.t.length; i++) { tDiff = Math.max(tDiff, Math.abs(gt[i] - cpu.t[i])); tMax = Math.max(tMax, cpu.t[i]); }
  let hotVelDiff = 0;
  for (let i = 0; i < cpu.u.length; i++) hotVelDiff = Math.max(hotVelDiff, Math.abs(gv[i] - cpu.u[i]));
  out.temperature = { maxDiff: tDiff, maxCpu: tMax, velocityDiff: hotVelDiff };
  err('temperature');
  // Streak geometry: the GLSL direction and length against streak.ts for random steps, stalls, respawns and absent particles.
  if (kind === 1015) {
    const n = 256;
    const prev = new Float32Array(n * 4);
    const cur = new Float32Array(n * 4);
    let seed = 7;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) { prev[i * 4 + k] = rnd() * 40; cur[i * 4 + k] = prev[i * 4 + k] + (i % 8 === 0 ? 0 : (rnd() - 0.5) * (i % 5 === 0 ? 0.001 : i % 3 === 0 ? 6 : 1.2)); }
      prev[i * 4 + 3] = 10; cur[i * 4 + 3] = i % 11 === 0 ? 0 : 11;
      if (i % 13 === 0) prev[i * 4] = -1e6;
    }
    const tex = (d: Float32Array) => { const t = new DataTexture(d, n, 1, RGBAFormat, FloatType); t.needsUpdate = true; return t; };
    const t0 = tex(prev);
    const t1 = tex(cur);
    const cellMm = 4.5;
    const m = pass(STREAK_PARITY, { T0: { value: t0 }, T1: { value: t1 }, uCellMm: { value: cellMm } });
    const rt = target(n, 1, kind);
    const runner = new PassRunner(renderer);
    runner.run(m, rt);
    const got = new Float32Array(n * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, n, 1, got);
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      const d = stepDisplacement(prev.subarray(i * 4, i * 4 + 3), cur.subarray(i * 4, i * 4 + 3), prev[i * 4 + 3], cur[i * 4 + 3], cellMm);
      const want = streakOf(d);
      const wantTail = [want.dir[0] * want.length, want.dir[1] * want.length, want.dir[2] * want.length];
      const gotTail = [got[i * 4] * got[i * 4 + 3], got[i * 4 + 1] * got[i * 4 + 3], got[i * 4 + 2] * got[i * 4 + 3]];
      for (let k = 0; k < 3; k++) maxDiff = Math.max(maxDiff, Math.abs(wantTail[k] - gotTail[k]));
      maxDiff = Math.max(maxDiff, Math.abs(want.length - got[i * 4 + 3]));
    }
    out.streak = { n, maxDiff };
    t0.dispose(); t1.dispose(); m.dispose(); rt.dispose(); runner.dispose();
    err('streak');
  }
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

  // Every fan stopped and a hot GPU: the layer still solves and starts plume particles at the part; at room temperature none start.
  const stillInput = inputFor([fronts[0], fronts[1], rear], [gpuBox], defaultDir, 0);
  const plumeAt = async (gpu: number) => {
    const hostP = new Group();
    const scP = new Scene();
    scP.add(hostP);
    const l = new FlowLayer(renderer, hostP, new Vector3(480, 440, 360), {
      cool: new Color('#38bdf8'), warm: new Color('#f59e0b'), hot: new Color('#ef4444'), collision: new Color('#ef4444'), porous: new Color('#38bdf8'),
    });
    // The coarsest tier keeps the software renderer quick; particles start once the first solve settles.
    l.dropTier();
    l.dropTier();
    l.setTemps({ gpu, cpu: null });
    l.setInput(stillInput);
    l.setOptions({ particles: true, collisions: false, speed: 1.5 });
    let frames = 0;
    while (!l.settled && frames < 3000) { l.frame(performance.now(), cam, 240); renderer.render(scP, cam); if (++frames % 40 === 0) await new Promise(r => setTimeout(r, 0)); }
    for (let f = 0; f < 150; f++) { l.frame(performance.now(), cam, 240); renderer.render(scP, cam); }
    const { pos, heat } = l.readParticles();
    let alive = 0;
    let warm = 0;
    for (let i = 0; i < pos.length / 4; i++) if (pos[i * 4] > -1e5 && pos[i * 4 + 3] > 0) { alive++; if (heat[i * 4] > 2) warm++; }
    l.dispose();
    return { alive, warm, frames };
  };
  out.plume = { hot: await plumeAt(75), cold: await plumeAt(22) };

  // What the user sees: per-frame displacement of the particles within one fan diameter downstream of a slow and a fast fan on one face.
  const pair = inputFor([fronts[0], fronts[1], rear], [], defaultDir, 60);
  // A rear exhaust takes what the two intakes bring, so neither intake is blocked by the other.
  pair.fanCfm = { [fronts[0].key]: 26.4, [fronts[1].key]: 60, [rear.key]: 86.4 };
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
  const centers: number[][] = [];
  const e = fs2.emitters;
  for (let o = 0; o < e.length; o += EMITTER_STRIDE) if (!centers.some(c => c[0] === e[o] && c[1] === e[o + 1] && c[2] === e[o + 2])) centers.push([e[o], e[o + 1], e[o + 2], e[o + 4], e[o + 5], e[o + 6], e[o + 7]]);
  const sums = centers.map(() => 0);
  const counts = centers.map(() => 0);
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
        centers.forEach((c, n) => {
          const rel = [prev![i * 4] - c[0], prev![i * 4 + 1] - c[1], prev![i * 4 + 2] - c[2]];
          const along = rel[0] * c[3] + rel[1] * c[4] + rel[2] * c[5];
          const radial = Math.hypot(rel[0] - along * c[3], rel[1] - along * c[4], rel[2] - along * c[5]);
          if (along > 0 && along <= 2 * c[6] && radial <= c[6]) { sums[n] += d; counts[n]++; }
        });
      }
    }
    prev = pos;
  }
  out.visibleSpeed = { centers: centers.length, means: sums.map((s, n) => (counts[n] ? s / counts[n] : 0)), counts, tier: slowFast.currentTier, framesToSteady, settled: slowFast.settled };
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

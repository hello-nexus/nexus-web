import { Color, Group, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { CpuFlow } from './cpuSolver';
import { caseWithGpuAndShroud } from './flowFixtures';
import { FlowLayer } from './flowLayer';
import { GlFlow, PassRunner, floatSupport } from './glFlow';
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
  const runner = new PassRunner(renderer);
  const gl = new GlFlow(renderer, runner, scene, kind);
  const cpu = new CpuFlow(scene);
  err('construct');
  for (let i = 0; i < 60; i++) { gl.step(); cpu.step(); }
  err('steps');
  const g = gl.readVelocity();
  err('readVelocity');
  let maxDiff = 0;
  let maxCpu = 0;
  for (let i = 0; i < cpu.u.length; i++) { maxDiff = Math.max(maxDiff, Math.abs(g[i] - cpu.u[i])); maxCpu = Math.max(maxCpu, Math.abs(cpu.u[i])); }
  out.velocity = { maxDiff, maxCpu };
  out.measure = await gl.measure();
  err('measure');

  const host = new Group();
  const layer = new FlowLayer(renderer, host, new Vector3(480, 440, 360), {
    cool: new Color('#38bdf8'), warm: new Color('#f59e0b'), hot: new Color('#ef4444'), dead: new Color('#f59e0b'), solid: new Color('#ffffff'),
  });
  const sc = new Scene();
  sc.add(host);
  const cam = new PerspectiveCamera(40, 4 / 3, 1, 5000);
  cam.position.set(900, 650, 900);
  cam.lookAt(240, 220, 180);
  layer.setInput(input);
  const q = new URLSearchParams(location.search);
  layer.setOptions({ particles: q.get('p') !== '0', deadZones: q.get('d') !== '0', debugSolids: false });
  let worst = 0;
  let checked = 0;
  for (let f = 0; f < FRAMES; f++) {
    layer.frame(f * 16, cam, 240);
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
    layer.frame((FRAMES + f) * 16, cam, 240);
    renderer.render(sc, cam);
    if (f % 20 === 19) { const r = bad(layer); afterWorst += r.badCount; afterChecked += r.checked; }
  }
  out.afterTierDrop = { checked: afterChecked, inSolidOrOutside: afterWorst, tier: layer.currentTier, dims: layer.scene!.dims };
  out.glError = renderer.getContext().getError();
  out.trail = trail.slice(0, 8);
  layer.dispose();
  gl.dispose();
  renderer.forceContextLoss();
}

main().catch(e => { out.exception = String(e) + ((e as Error).stack ?? ''); }).finally(() => {
  out.consoleErrors = errors;
  window.__flowGl = out;
  document.title = 'done';
});

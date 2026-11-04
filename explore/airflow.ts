import fixture from '../src/lib/cooling/__fixtures__/t1-cooling-state.json';
import { parseCaseLayout } from '../src/lib/cooling/caseLayout';
import { createCaseRenderer } from '../src/panel/widgets/cooling/case3d/coolingCaseRenderer';
import { FLOW_VARIANTS, setFlowVariant } from '../src/lib/cooling/flow/flowVariant';
import { VISUAL_TIME_SCALE } from '../src/lib/cooling/flow/flowParams';
import type { FanDirection } from '../src/lib/cooling/pressureModel';

const params = new URLSearchParams(location.search);
const name = params.get('variant') ?? 'Current';
// o.<field>=<number> overrides a variant field, for probing.
const variant = { ...(FLOW_VARIANTS[name] ?? FLOW_VARIANTS.Current) } as Record<string, unknown> as unknown as (typeof FLOW_VARIANTS)[string];
for (const [k, v] of params) if (k.startsWith('o.')) (variant as unknown as Record<string, number>)[k.slice(2)] = Number(v);
setFlowVariant(variant);

const bar = document.getElementById('bar')!;
for (const key of Object.keys(FLOW_VARIANTS)) {
  const a = document.createElement('a');
  a.href = `?variant=${key}`;
  a.textContent = key;
  if (key === name) a.className = 'on';
  bar.appendChild(a);
}
if (params.get('chrome') === '0') bar.style.display = 'none';

// T1's Y70 with its real fans: right side and bottom draw air in, rear and top push it out.
const intake = ['right:120:1', 'right:120:2', 'bottom:120:1'];
const exhaust = ['rear:140:0', 'top:140:0'];
const raw = JSON.parse(JSON.stringify(fixture.caseLayout)) as { fanSlots: { key: string; taken: string | null }[] };
for (const s of raw.fanSlots) if ([...intake, ...exhaust].includes(s.key)) s.taken = 'fan';
const layout = parseCaseLayout(raw)!;
const directions: Record<string, FanDirection> = {};
const fanCfm: Record<string, number> = {};
// fans=slow|fast|mixed sets the flow of every fan: slow about 20 CFM, fast about 80. Mixed has one slow and one fast intake on the right side, the rest medium.
const fans = params.get('fans');
const SLOW = 20; const FAST = 80; const MID = 50;
// fans=max runs every fan at about 100 CFM per 120 mm fan (about 2200 RPM), scaled by area for other sizes; the largest is the reference.
const sizeOf = (k: string) => Number(k.split(':')[1]);
const maxOf = (k: string) => Math.round(100 * (sizeOf(k) / 120) ** 2);
const flowOf = (k: string) => (fans === 'max' ? maxOf(k) : fans === 'slow' ? SLOW : fans === 'fast' ? FAST : fans === 'mixed' ? (k === 'right:120:1' ? SLOW : k === 'right:120:2' ? FAST : MID) : 55);
for (const k of intake) { directions[k] = 'intake'; fanCfm[k] = flowOf(k); }
for (const k of exhaust) { directions[k] = 'exhaust'; fanCfm[k] = flowOf(k); }

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = createCaseRenderer(canvas, () => {});
renderer.resize();
addEventListener('resize', () => renderer.resize());
renderer.setState({
  layout, directions, highlighted: new Set(), bound: new Set(), showCase: true, simulated: new Set(), active: null,
  flow: { layout, directions, fanCfm, ventCfm: 0, referenceCfm: fans === 'max' ? Math.max(...[...intake, ...exhaust].map(maxOf)) : fans ? FAST : undefined },
  flowOptions: { particles: true, collisions: false, speed: 1.5, timeScale: VISUAL_TIME_SCALE },
});
if (variant.temps) renderer.setTemps({ cpu: 88, gpu: 80, cpuW: 160, gpuW: 320 });
(window as unknown as { __renderer: unknown }).__renderer = renderer;

// Probe: tracks every drawn particle across consecutive frames. Alpha change is judged per particle step (the clock runs 120 steps a second, so two steps a frame at 60 Hz), so a slow headless frame does not hide or fake a pop.
(window as unknown as { __probe: unknown }).__probe = (frames: number, scenario: string) => new Promise(resolve => {
  const flow = renderer.debugFlow?.();
  const n = Math.round(128 * 84 * variant.drawShare);
  let prev: Float32Array | null = null;
  let prevState: Float32Array | null = null;
  let frame = 0;
  const respawnPops: unknown[] = [];
  const fast: unknown[] = [];
  const jumps: unknown[] = [];
  const hist: number[][][] = [];
  const traces: unknown[] = [];
  let maxRate = 0; let maxFrameDrop = 0; let maxLayerDrop = 0; let prevLayerFade = 1;
  const loop = () => {
    const d = flow?.debugFade();
    if (d) {
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = d.alpha[i * 4] * d.fade;
      if (prev && prevState) {
        maxLayerDrop = Math.max(maxLayerDrop, prevLayerFade - d.fade);
        for (let i = 0; i < n; i++) {
          const dAge = d.state[i * 4 + 3] - prevState[i * 4 + 3];
          const delta = a[i] - prev[i];
          const dist = Math.hypot(d.state[i * 4] - prevState[i * 4], d.state[i * 4 + 1] - prevState[i * 4 + 1], d.state[i * 4 + 2] - prevState[i * 4 + 2]);
          if (frame < 4 || dAge === 0) continue;
          if (dAge > 40 && prev[i] > 0.02 && a[i] < 0.001 && traces.length < 2) traces.push({ i, frames: hist.map(h => h[i]) });
          if (dAge < 0) { if (prev[i] > 0.05 && respawnPops.length < 12) respawnPops.push({ frame, i, from: +prev[i].toFixed(3), to: +a[i].toFixed(3), age: [prevState[i * 4 + 3], d.state[i * 4 + 3]] }); continue; }
          if (-delta > maxFrameDrop) maxFrameDrop = -delta;
          const rate = Math.abs(delta) / dAge;
          if (d.fade >= 0.999 && prevLayerFade >= 0.999) {
            if (rate > maxRate) maxRate = rate;
            if (rate > 0.1 && fast.length < 12) fast.push({ frame, i, from: +prev[i].toFixed(3), to: +a[i].toFixed(3), dAge, ratePerStep: +rate.toFixed(3), cells: +dist.toFixed(2), ageNow: d.state[i * 4 + 3] });
          }
          if (prev[i] > 0.05 && a[i] > 0.05 && dist > 3 * Math.max(1, dAge / 6) && jumps.length < 12) jumps.push({ frame, i, cells: +dist.toFixed(2), dAge, alpha: +a[i].toFixed(2) });
        }
      }
      hist.push(Array.from({ length: n }, (_, i) => [d.state[i * 4 + 3], +a[i].toFixed(3), +d.state[i * 4].toFixed(1), +d.state[i * 4 + 1].toFixed(1), +d.state[i * 4 + 2].toFixed(1)]));
      if (hist.length > 8) hist.shift();
      prev = a; prevState = d.state.slice(); prevLayerFade = d.fade;
    }
    if (scenario === 'tier' && frame === 40) flow?.forceDropTier();
    if (scenario === 'toggle' && (frame === 40 || frame === 160)) {
      renderer.setState({ layout, directions, highlighted: new Set(), bound: new Set(), showCase: true, simulated: new Set(), active: null, flow: { layout, directions, fanCfm, ventCfm: 0, referenceCfm: fans === 'max' ? Math.max(...[...intake, ...exhaust].map(maxOf)) : fans ? FAST : undefined }, flowOptions: { particles: frame === 160, collisions: false, speed: 1.5, timeScale: VISUAL_TIME_SCALE } });
    }
    frame++;
    if (frame < frames) requestAnimationFrame(loop);
    else resolve({ frames, n, maxRatePerStep: +maxRate.toFixed(3), maxFrameDrop: +maxFrameDrop.toFixed(3), maxLayerDropPerFrame: +maxLayerDrop.toFixed(3), respawnPops: respawnPops.slice(0, 4), fast, jumps, traces });
  };
  requestAnimationFrame(loop);
});

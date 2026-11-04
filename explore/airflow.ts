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
// fans=slow|fast|mixed sets the flow of every one of those: slow about 20 CFM, fast about 80. Mixed has one slow and one fast intake on the right side, the rest medium.
// fans=max also runs the top radiator's three fans (exhaust) and the card's two fans, every one at about 100 CFM per 120 mm fan (about 2200 RPM), scaled by area for other sizes. A3-3 opens in this mode.
const fans = params.get('fans') ?? (name === 'A3-3' ? 'max' : null);
const caseIntake = ['right:120:1', 'right:120:2', 'bottom:120:1'];
const caseExhaust = ['rear:140:0', 'top:140:0'];
const intake = fans === 'max' ? [...caseIntake, 'gpu:fan:0', 'gpu:fan:1'] : caseIntake;
const exhaust = fans === 'max' ? [...caseExhaust, 'rad:0', 'rad:1', 'rad:2'] : caseExhaust;
const raw = JSON.parse(JSON.stringify(fixture.caseLayout)) as { fanSlots: { key: string; taken: string | null }[] };
for (const s of raw.fanSlots) if ([...caseIntake, ...caseExhaust].includes(s.key)) s.taken = 'fan';
const layout = parseCaseLayout(raw)!;
(window as unknown as { __slots: unknown }).__slots = layout.fanSlots.map(s => ({ key: s.key, position: s.position, size: s.size, taken: s.taken, axis: s.axis }));
const directions: Record<string, FanDirection> = {};
const fanCfm: Record<string, number> = {};
const SLOW = 20; const FAST = 80; const MID = 50;
const sizeOf = (k: string) => layout.fanSlots.find(s => s.key === k)?.size ?? 120;
const maxOf = (k: string) => Math.round(100 * (sizeOf(k) / 120) ** 2);
const flowOf = (k: string) => (fans === 'max' ? maxOf(k) : fans === 'slow' ? SLOW : fans === 'fast' ? FAST : fans === 'mixed' ? (k === 'right:120:1' ? SLOW : k === 'right:120:2' ? FAST : MID) : 55);
for (const k of intake) { directions[k] = 'intake'; fanCfm[k] = flowOf(k); }
for (const k of exhaust) { directions[k] = 'exhaust'; fanCfm[k] = flowOf(k); }
const referenceCfm = fans === 'max' ? Math.max(...[...intake, ...exhaust].map(maxOf)) : fans ? FAST : undefined;
(window as unknown as { __fans: unknown }).__fans = [...intake.map(k => ({ key: k, dir: 'intake', cfm: fanCfm[k] })), ...exhaust.map(k => ({ key: k, dir: 'exhaust', cfm: fanCfm[k] }))];

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = createCaseRenderer(canvas, () => {});
renderer.resize();
addEventListener('resize', () => renderer.resize());
renderer.setState({
  layout, directions, highlighted: new Set(), bound: new Set(), showCase: true, simulated: new Set(), active: null,
  flow: { layout, directions, fanCfm, ventCfm: 0, referenceCfm },
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
      renderer.setState({ layout, directions, highlighted: new Set(), bound: new Set(), showCase: true, simulated: new Set(), active: null, flow: { layout, directions, fanCfm, ventCfm: 0, referenceCfm }, flowOptions: { particles: frame === 160, collisions: false, speed: 1.5, timeScale: VISUAL_TIME_SCALE } });
    }
    frame++;
    if (frame < frames) requestAnimationFrame(loop);
    else resolve({ frames, n, maxRatePerStep: +maxRate.toFixed(3), maxFrameDrop: +maxFrameDrop.toFixed(3), maxLayerDropPerFrame: +maxLayerDrop.toFixed(3), respawnPops: respawnPops.slice(0, 4), fast, jumps, traces });
  };
  requestAnimationFrame(loop);
});

// Region probe: particles under the GPU. Reports counts, speed and how long each lingers there slowly.
(window as unknown as { __region: unknown }).__region = (frames: number, box: number[]) => new Promise(resolve => {
  const flow = renderer.debugFlow?.();
  const sc = flow?.debugScene();
  const n = Math.round(128 * 84 * variant.drawShare);
  if (!flow || !sc) { resolve(null); return; }
  const [x0, x1, y0, y1, z0, z1] = box;
  let prev: Float32Array | null = null;
  const dwell = new Float32Array(n);
  let maxDwell = 0; let frame = 0;
  const rows: unknown[] = [];
  const samples: unknown[] = [];
  const loop = () => {
    const d = flow.debugFade();
    if (d) {
      let inCount = 0; let slow = 0; let speedSum = 0; let alphaSum = 0;
      for (let i = 0; i < n; i++) {
        if (d.state[i * 4] < -1e5) continue;
        const mm = [0, 1, 2].map(k => (d.state[i * 4 + k] + 0.5) * sc.cellMm - sc.origin[k]);
        const inside = mm[0] >= x0 && mm[0] <= x1 && mm[1] >= y0 && mm[1] <= y1 && mm[2] >= z0 && mm[2] <= z1;
        const alpha = d.alpha[i * 4] * d.fade;
        if (inside && alpha > 0.03) {
          inCount++; alphaSum += alpha;
          if (prev) {
            const dAge = d.state[i * 4 + 3] - prev[i * 4 + 3];
            if (dAge > 0 && dAge < 40) {
              const sp = Math.hypot(d.state[i * 4] - prev[i * 4], d.state[i * 4 + 1] - prev[i * 4 + 1], d.state[i * 4 + 2] - prev[i * 4 + 2]) * sc.cellMm / dAge;
              speedSum += sp;
              if (sp < 0.4) { slow++; dwell[i] += dAge; if (dwell[i] > maxDwell) maxDwell = dwell[i]; } else dwell[i] = 0;
              if (samples.length < 6 && sp < 0.4 && frame > 10) samples.push({ i, mm: mm.map(v => Math.round(v)), sp: +sp.toFixed(2), age: Math.round(d.state[i * 4 + 3]), alpha: +alpha.toFixed(2) });
            }
          }
        } else dwell[i] = 0;
      }
      if (frame % 20 === 0) rows.push({ frame, inCount, slow, meanSpeedMmPerStep: inCount ? +(speedSum / inCount).toFixed(2) : 0, meanAlpha: inCount ? +(alphaSum / inCount).toFixed(2) : 0 });
      prev = d.state.slice();
    }
    frame++;
    if (frame < frames) requestAnimationFrame(loop); else resolve({ cellMm: sc.cellMm, maxDwellSteps: Math.round(maxDwell), rows, samples });
  };
  requestAnimationFrame(loop);
});

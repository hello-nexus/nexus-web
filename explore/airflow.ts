import fixture from '../src/lib/cooling/__fixtures__/t1-cooling-state.json';
import { collapseMounts, linkChannelToSlot, normalizeBindings, parseCaseLayout, type CaseLayout, type FanBinding } from '../src/lib/cooling/caseLayout';
import { boundSlotKeys, slotDirections, slotSpeeds, withDefaultBindings } from '../src/lib/cooling/slotFlow';
import { visualFlow } from '../src/lib/cooling/visualFlow';
import { fanRotorSpeeds } from '../src/lib/cooling/fanRotors';
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

// fans=t1 (the default for A3-3 variants) runs each fan from the T1 fixture's own bindings and channel speeds through the same path the app uses: collapseMounts, withDefaultBindings, slotSpeeds, visualFlow.
// fans=slow|fast|mixed drive T1's Y70 with its case fans only: right side and bottom draw air in, rear and top push it out, at about 20 CFM, 80 CFM, or mixed.
// fans=max also runs the top radiator's three fans (exhaust) and the card's two fans, every one at about 100 CFM per 120 mm fan, scaled by area for other sizes.
const fans = params.get('fans') ?? (name.startsWith('A3-3') ? 't1' : null);
const caseIntake = ['right:120:1', 'right:120:2', 'bottom:120:1'];
const caseExhaust = ['rear:140:0', 'top:140:0'];
let layout: CaseLayout;
let intake: string[];
let exhaust: string[];
let directions: Record<string, FanDirection> = {};
const fanCfm: Record<string, number> = {};
let ventCfm = 0;
let referenceCfm: number | undefined;
let rotors: Map<string, number> | undefined;
if (fans === 't1') {
  const parsed = parseCaseLayout(fixture.caseLayout)!;
  const stored = fixture.layout.bindings as unknown as FanBinding[];
  const channels = fixture.channels as unknown as Parameters<typeof slotSpeeds>[2];
  const collapsed = collapseMounts(parsed, boundSlotKeys(stored, channels));
  layout = collapsed.layout;
  let bindings = withDefaultBindings(normalizeBindings(stored, collapsed.canonOf), layout.fanSlots, channels);
  // radrpm=<rpm> drives the top radiator's fans at that simulated speed.
  const radRpm = Number(params.get('radrpm'));
  if (radRpm > 0) for (const slot of layout.fanSlots) if (slot.key.startsWith('rad:')) bindings = linkChannelToSlot(bindings, `sim:${radRpm}`, slot.key, false);
  directions = slotDirections(layout.fanSlots, fixture.layout.directions as Record<string, FanDirection>);
  const flow = visualFlow(layout.fanSlots, [], slotSpeeds(layout.fanSlots, bindings, channels), directions);
  // Rotors turn for the fans someone assigned: a real channel or a chosen simulated speed, not the derived default.
  rotors = fanRotorSpeeds(layout.fanSlots, bindings, normalizeBindings(stored, collapsed.canonOf), channels);
  (window as unknown as { __rotors: unknown }).__rotors = [...rotors];
  Object.assign(fanCfm, flow.fanCfm);
  ventCfm = flow.ventCfm;
  referenceCfm = flow.referenceCfm;
  intake = Object.keys(fanCfm).filter(k => fanCfm[k] > 0 && directions[k.split('#')[0]] !== 'exhaust');
  exhaust = Object.keys(fanCfm).filter(k => fanCfm[k] > 0 && directions[k.split('#')[0]] === 'exhaust');
} else {
  intake = fans === 'max' ? [...caseIntake, 'gpu:fan:0', 'gpu:fan:1'] : caseIntake;
  exhaust = fans === 'max' ? [...caseExhaust, 'rad:0', 'rad:1', 'rad:2'] : caseExhaust;
  const raw = JSON.parse(JSON.stringify(fixture.caseLayout)) as { fanSlots: { key: string; taken: string | null }[] };
  for (const s of raw.fanSlots) if ([...caseIntake, ...caseExhaust].includes(s.key)) s.taken = 'fan';
  layout = parseCaseLayout(raw)!;
  const SLOW = 20; const FAST = 80; const MID = 50;
  const sizeOf = (k: string) => layout.fanSlots.find(s => s.key === k)?.size ?? 120;
  const maxOf = (k: string) => Math.round(100 * (sizeOf(k) / 120) ** 2);
  const flowOf = (k: string) => (fans === 'max' ? maxOf(k) : fans === 'slow' ? SLOW : fans === 'fast' ? FAST : fans === 'mixed' ? (k === 'right:120:1' ? SLOW : k === 'right:120:2' ? FAST : MID) : 55);
  for (const k of intake) { directions[k] = 'intake'; fanCfm[k] = flowOf(k); }
  for (const k of exhaust) { directions[k] = 'exhaust'; fanCfm[k] = flowOf(k); }
  referenceCfm = fans === 'max' ? Math.max(...[...intake, ...exhaust].map(maxOf)) : fans ? FAST : undefined;
}
(window as unknown as { __slots: unknown }).__slots = layout.fanSlots.map(s => ({ key: s.key, position: s.position, size: s.size, taken: s.taken, axis: s.axis }));
(window as unknown as { __fans: unknown }).__fans = [...intake.map(k => ({ key: k, dir: 'intake', cfm: fanCfm[k] })), ...exhaust.map(k => ({ key: k, dir: 'exhaust', cfm: fanCfm[k] }))];

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = createCaseRenderer(canvas, () => {});
renderer.resize();
addEventListener('resize', () => renderer.resize());
renderer.setState({
  layout, directions, highlighted: new Set(), bound: new Set(), showCase: true, simulated: new Set(), active: null,
  flow: { layout, directions, fanCfm, ventCfm, referenceCfm },
  flowOptions: { particles: true, collisions: false, speed: 1.5, timeScale: VISUAL_TIME_SCALE },
  rotors,
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

// Geometry probe: reads back every ribbon station the shader draws, per frame, with the particle clock fixed at two steps a frame (a steady 60 Hz display), and flags visible glitches.
(window as unknown as { __geo: unknown }).__geo = (frames: number, stepsPerFrame: number) => new Promise(resolve => {
  const flow = renderer.debugFlow?.();
  if (!flow) { resolve(null); return; }
  flow.forceSteps = stepsPerFrame;
  let prev: { head: number[]; tail: number[]; tailTan: number[]; len: number; alpha: number }[] | null = null;
  const flags = { pop: 0, collapse: 0, collapseWhileFading: 0, shake: 0, teleport: 0 };
  const examples: Record<string, unknown[]> = { pop: [], collapse: [], shake: [], teleport: [] };
  let frame = 0; let visibleSamples = 0; let maxLen = 0; let maxDrop = 0;
  const loop = () => {
    const g = flow.debugGeometry();
    if (g && frame > 30) {
      const { data, stations, drawn } = g;
      const cur: NonNullable<typeof prev> = [];
      for (let i = 0; i < drawn; i++) {
        const at = (k: number) => [data[(i * stations + k) * 4], data[(i * stations + k) * 4 + 1], data[(i * stations + k) * 4 + 2]];
        const alpha = data[i * stations * 4 + 3];
        let len = 0; let segMax = 0;
        for (let k = 1; k < stations; k++) { const a = at(k - 1); const b = at(k); const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); len += d; if (d > segMax) segMax = d; }
        const head = at(0); const tail = at(stations - 1); const t2 = at(stations - 2);
        const tan = [tail[0] - t2[0], tail[1] - t2[1], tail[2] - t2[2]];
        cur.push({ head, tail, tailTan: tan, len, alpha });
        if (alpha > 0.05) { visibleSamples++; if (len > maxLen) maxLen = len; }
        if (alpha > 0.05 && segMax > 60) { flags.teleport++; if (examples.teleport.length < 4) examples.teleport.push({ frame, i, segMax: Math.round(segMax) }); }
        const p = prev?.[i];
        if (p) {
          const drop = p.alpha - alpha;
          if (drop > maxDrop) maxDrop = drop;
          if (drop > 0.15) { flags.pop++; if (examples.pop.length < 4) examples.pop.push({ frame, i, from: +p.alpha.toFixed(2), to: +alpha.toFixed(2) }); }
          if (p.len > 20 && alpha > 0.1 && p.alpha > 0.1 && len < 0.7 * p.len && alpha < p.alpha - 0.002) flags.collapseWhileFading++;
          if (p.len > 20 && alpha > 0.1 && p.alpha > 0.1 && len < 0.7 * p.len && alpha >= p.alpha - 0.002) { flags.collapse++; if (examples.collapse.length < 4) examples.collapse.push({ frame, i, from: Math.round(p.len), to: Math.round(len), alpha: +alpha.toFixed(2) }); }
          const headMove = Math.hypot(head[0] - p.head[0], head[1] - p.head[1], head[2] - p.head[2]);
          const dx = [tail[0] - p.tail[0], tail[1] - p.tail[1], tail[2] - p.tail[2]];
          const tl = Math.hypot(tan[0], tan[1], tan[2]) || 1;
          const along = (dx[0] * tan[0] + dx[1] * tan[1] + dx[2] * tan[2]) / tl;
          const perp = Math.sqrt(Math.max(0, dx[0] ** 2 + dx[1] ** 2 + dx[2] ** 2 - along ** 2));
          if (alpha > 0.1 && p.alpha > 0.1 && alpha >= p.alpha - 0.002 && headMove < 2 && perp > 2.5) { flags.shake++; if (examples.shake.length < 4) examples.shake.push({ frame, i, headMove: +headMove.toFixed(2), tailPerp: +perp.toFixed(2), alpha: +alpha.toFixed(2) }); }
        }
      }
      prev = cur;
    }
    frame++;
    if (frame < frames) requestAnimationFrame(loop);
    else { flow.forceSteps = 0; resolve({ frames, flags, maxAlphaDropPerFrame: +maxDrop.toFixed(3), maxVisibleLenMm: Math.round(maxLen), visibleSamples, examples }); }
  };
  requestAnimationFrame(loop);
});

// Fate probe: follows particles that reach the radiator block and reports where they end.
(window as unknown as { __fate: unknown }).__fate = (frames: number) => new Promise(resolve => {
  const flow = renderer.debugFlow?.();
  const sc = flow?.debugScene();
  const radBoxes = layout.fanSlots.filter(sl => sl.taken === 'radiator' && sl.box).map(sl => sl.box!);
  const rad = radBoxes.length ? { min: [0, 1, 2].map(k => Math.min(...radBoxes.map(b => b.min[k]))), size: [0, 1, 2].map(k => Math.max(...radBoxes.map(b => b.min[k] + b.size[k])) - Math.min(...radBoxes.map(b => b.min[k]))) } : undefined;
  if (!flow || !sc || !rad) { resolve({ error: 'no flow, scene or radiator box' }); return; }
  const n = Math.round(128 * 84 * variant.drawShare);
  const lo = rad.min; const hi = [rad.min[0] + rad.size[0], rad.min[1] + rad.size[1], rad.min[2] + rad.size[2]];
  const inBox = (m: number[]) => m[0] >= lo[0] && m[0] <= hi[0] && m[1] >= lo[1] && m[1] <= hi[1] && m[2] >= lo[2] && m[2] <= hi[2];
  const entered = new Set<number>(); const passed = new Set<number>(); const diedInside = new Set<number>();
  let prev: Float32Array | null = null; let prevAlpha: Float32Array | null = null;
  let speedSum = 0; let speedN = 0; let stuckN = 0; let frame = 0; const samples: unknown[] = [];
  const loop = () => {
    const d = flow.debugFade();
    if (d) {
      for (let i = 0; i < n; i++) {
        if (d.state[i * 4] < -1e5) continue;
        const mm = [0, 1, 2].map(k => (d.state[i * 4 + k] + 0.5) * sc.cellMm - sc.origin[k]);
        const a = d.alpha[i * 4];
        if (inBox(mm)) {
          if (!entered.has(i)) { entered.add(i); if (samples.length < 4) samples.push({ i, enterAt: mm.map(v => Math.round(v)) }); }
          if (prev) {
            const dAge = d.state[i * 4 + 3] - prev[i * 4 + 3];
            if (dAge > 0 && dAge < 40) { const sp = Math.hypot(d.state[i * 4] - prev[i * 4], d.state[i * 4 + 1] - prev[i * 4 + 1], d.state[i * 4 + 2] - prev[i * 4 + 2]) * sc.cellMm / dAge; speedSum += sp; speedN++; if (sp < 0.4) stuckN++; }
          }
          if (prevAlpha && prevAlpha[i] > 0.05 && a < 0.02) diedInside.add(i);
        } else if (entered.has(i) && mm[1] > hi[1] + 5) passed.add(i);
      }
      prev = d.state.slice(); prevAlpha = d.alpha.map((v, k) => (k % 4 === 0 ? v : 0));
    }
    frame++;
    if (frame < frames) requestAnimationFrame(loop);
    else resolve({ cellMm: sc.cellMm, radBox: { lo, hi }, entered: entered.size, passedAboveTop: passed.size, fadedWhileInside: diedInside.size, meanSpeedMmPerStepInside: speedN ? +(speedSum / speedN).toFixed(2) : 0, slowShareInside: speedN ? +(stuckN / speedN).toFixed(2) : 0, samples, info: flow.debugInfo() });
  };
  requestAnimationFrame(loop);
});

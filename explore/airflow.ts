import fixture from '../src/lib/cooling/__fixtures__/t1-cooling-state.json';
import { parseCaseLayout } from '../src/lib/cooling/caseLayout';
import { createCaseRenderer } from '../src/panel/widgets/cooling/case3d/coolingCaseRenderer';
import { FLOW_VARIANTS, setFlowVariant } from '../src/lib/cooling/flow/flowVariant';
import { VISUAL_TIME_SCALE } from '../src/lib/cooling/flow/flowParams';
import type { FanDirection } from '../src/lib/cooling/pressureModel';

const params = new URLSearchParams(location.search);
const name = params.get('variant') ?? 'Current';
setFlowVariant(FLOW_VARIANTS[name] ?? FLOW_VARIANTS.Current);

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
for (const k of intake) { directions[k] = 'intake'; fanCfm[k] = 55; }
for (const k of exhaust) { directions[k] = 'exhaust'; fanCfm[k] = 55; }

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = createCaseRenderer(canvas, () => {});
renderer.resize();
addEventListener('resize', () => renderer.resize());
renderer.setState({
  layout, directions, highlighted: new Set(), bound: new Set(), showCase: true, simulated: new Set(), active: null,
  flow: { layout, directions, fanCfm, ventCfm: 0 },
  flowOptions: { particles: true, collisions: false, speed: 1.5, timeScale: VISUAL_TIME_SCALE },
});
(window as unknown as { __renderer: unknown }).__renderer = renderer;

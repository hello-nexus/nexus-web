import fixture from '../src/lib/cooling/__fixtures__/t1-cooling-state.json';
import { collapseMounts, linkChannelToSlot, normalizeBindings, parseCaseLayout, type CaseLayout, type FanBinding } from '../src/lib/cooling/caseLayout';
import { boundSlotKeys, slotDirections, slotSpeeds, withDefaultBindings } from '../src/lib/cooling/slotFlow';
import { visualFlow } from '../src/lib/cooling/visualFlow';
import { fanRotorSpeeds } from '../src/lib/cooling/fanRotors';
import { createCaseRenderer } from '../src/panel/widgets/cooling/case3d/coolingCaseRenderer';
import { VISUAL_TIME_SCALE } from '../src/lib/cooling/flow/flowParams';
import type { FanDirection } from '../src/lib/cooling/pressureModel';

const params = new URLSearchParams(location.search);

// fans=t1 (the default) runs each fan from the T1 fixture's own bindings and channel speeds through the same path the app uses: collapseMounts, withDefaultBindings, slotSpeeds, visualFlow.
// fans=slow|fast|mixed drive T1's Y70 with its case fans only: right side and bottom draw air in, rear and top push it out, at about 20 CFM, 80 CFM, or mixed.
// fans=max also runs the top radiator's three fans (exhaust) and the card's two fans, every one at about 100 CFM per 120 mm fan, scaled by area for other sizes.
const fans = params.get('fans') ?? 't1';
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
// Part temperatures for the preview, so the air warms.
renderer.setTemps({ cpu: 88, gpu: 80, cpuW: 160, gpuW: 320 });

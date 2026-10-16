// Flat drawings of a ROG Astral card for its device page, plain SVG: the card from
// the side and from its end (Level Sense turns them), the curved arrows that light up
// the way the card moved, and the card's 12V-2x6 power connector with each pin's
// current in GPU Tweak III's colours (Power detector).
import { useId, type ReactNode } from 'react';
import { ampsText, connectorState, pinState, type PinLimits, type PinState, type StageExtent } from './astralUtils';

// Ids inside an inline SVG are page-wide, so each drawing prefixes its own.
function useSvgIds(): (name: string) => string {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (name: string) => `${base}-${name}`;
}

const FONT = 'Segoe UI, Arial, sans-serif';

// ── Level Sense ─────────────────────────────────────────────────────────────────

// The side view is drawn in a 400-unit frame and shown through a square centred on
// the bracket, so the card turns about the bracket the way a sagging card does.
export const SAG_PIVOT = [28, 205] as const;
const SAG_HALF = 440;
export const SAG_VIEW = `${SAG_PIVOT[0] - SAG_HALF} ${SAG_PIVOT[1] - SAG_HALF} ${2 * SAG_HALF} ${2 * SAG_HALF}`;
/** The side view plus its arrow, in view units. */
export const SAG_EXTENT: StageExtent = { x0: 20, x1: 441, y0: 108, y1: 302, half: SAG_HALF, pivot: SAG_PIVOT };

// The end view is shown through a square centred on the bottom edge, where the card
// sits in its PCIe slot, so it leans about the slot.
export const TILT_PIVOT = [198, 294] as const;
const TILT_HALF = 300;
export const TILT_VIEW = `${TILT_PIVOT[0] - TILT_HALF} ${TILT_PIVOT[1] - TILT_HALF} ${2 * TILT_HALF} ${2 * TILT_HALF}`;
/** Symmetric about the slot, so the upright line runs through the middle of the card. */
export const TILT_EXTENT: StageExtent = { x0: 33, x1: 363, y0: 31, y1: 296, half: TILT_HALF, pivot: TILT_PIVOT };

// One fan: metal frame, 11 swept blades joined by an outer ring, and the hub.
function Fan({ cx, cy, id }: { cx: number; cy: number; id: (name: string) => string }) {
  const blade = `M${cx} ${cy - 12} C${cx + 11} ${cy - 19} ${cx + 15} ${cy - 31} ${cx + 9} ${cy - 41} `
    + `L${cx - 1} ${cy - 41} C${cx + 3} ${cy - 31} ${cx - 1} ${cy - 21} ${cx - 9} ${cy - 10} Z`;
  return (
    <g>
      <circle cx={cx} cy={cy} r="47" fill={`url(#${id('frame')})`} />
      <circle cx={cx} cy={cy} r="43.5" fill="#090b0e" />
      {Array.from({ length: 11 }, (_, i) => (
        <path key={i} d={blade} transform={`rotate(${(i * 360 / 11).toFixed(2)} ${cx} ${cy})`}
          fill={`url(#${id('blade')})`} stroke="#11141a" strokeWidth="0.8" />
      ))}
      <circle cx={cx} cy={cy} r="41" fill="none" stroke="#2c3138" strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r="12.5" fill={`url(#${id('hub')})`} stroke="#0c0e11" strokeWidth="1" />
      <circle cx={cx} cy={cy} r="5" fill="#15181d" stroke="#5d646e" strokeWidth="1" />
    </g>
  );
}

/** Fan side of a triple-fan card: bracket on the left, backplate and light bar along the top, fins and PCIe fingers below. */
export function AstralSideView({ warn }: { warn: boolean }) {
  const id = useSvgIds();
  const [bandFrom, bandTo] = warn ? ['#ff4d4d', '#ff8a3d'] : ['#ff3fd2', '#29c5ff'];
  return (
    <svg viewBox={SAG_VIEW} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={id('shroud')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d424b" /><stop offset="0.55" stopColor="#262a30" /><stop offset="1" stopColor="#1a1d22" />
        </linearGradient>
        <linearGradient id={id('metal')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d7dbe1" /><stop offset="0.5" stopColor="#9aa1ab" /><stop offset="1" stopColor="#6d747e" />
        </linearGradient>
        <linearGradient id={id('back')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b727c" /><stop offset="1" stopColor="#2b2f35" />
        </linearGradient>
        <linearGradient id={id('band')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={bandFrom} /><stop offset="1" stopColor={bandTo} />
        </linearGradient>
        <linearGradient id={id('frame')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#565d67" /><stop offset="1" stopColor="#1f2328" />
        </linearGradient>
        <linearGradient id={id('blade')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#363b43" /><stop offset="1" stopColor="#1c1f24" />
        </linearGradient>
        <radialGradient id={id('hub')} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#5a616b" /><stop offset="1" stopColor="#22262c" />
        </radialGradient>
        <pattern id={id('fins')} width="4" height="20" patternUnits="userSpaceOnUse">
          <rect width="4" height="20" fill="#121418" /><rect width="1.6" height="20" fill="#3a3f47" />
        </pattern>
        <filter id={id('glow')} x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      {/* PCIe bracket with its top tab and vents */}
      <path d="M20 108 H36 V302 H26 V296 H20 Z" fill={`url(#${id('metal')})`} />
      {[136, 168, 200, 232].map(y => <rect key={y} x="26" y={y} width="5" height="22" rx="2" fill="#5b616b" />)}
      {/* PCIe fingers */}
      <path d="M94 270 H236 V283 H124 V279 H120 V283 H94 Z" fill="#c9a227" />
      {/* fin stack along the bottom */}
      <rect x="40" y="250" width="344" height="22" fill={`url(#${id('fins')})`} />
      {/* backplate edge and the light bar along the top */}
      <rect x="38" y="122" width="348" height="10" rx="2" fill={`url(#${id('back')})`} />
      <rect x="46" y="133" width="330" height="6" rx="3" fill={`url(#${id('band')})`} filter={`url(#${id('glow')})`} opacity="0.9" />
      <rect x="46" y="133" width="330" height="6" rx="3" fill={`url(#${id('band')})`} />
      {/* shroud with chamfered corners and a lighter facet on the left */}
      <path d="M44 140 H380 V242 L366 256 H214 L204 248 H62 L44 232 Z" fill={`url(#${id('shroud')})`} stroke="#4b525c" strokeWidth="1.5" />
      <path d="M44 140 H176 L146 248 H62 L44 232 Z" fill="#ffffff" opacity="0.045" />
      <path d="M262 140 L240 172 M372 150 L352 178 M206 248 L214 240 H366" stroke="#8b93a0" strokeOpacity="0.35" strokeWidth="1.2" fill="none" />
      <Fan cx={126} cy={195} id={id} />
      <Fan cx={226} cy={195} id={id} />
      <Fan cx={326} cy={195} id={id} />
    </svg>
  );
}

/** The card seen from its free end: the fan shroud, the fin stack, the PCB and the backplate. Its edges turn red past the limit. */
export function AstralEndView({ warn }: { warn: boolean }) {
  const id = useSvgIds();
  const edge = warn ? '#ef4444' : '#4b525c';
  return (
    <svg viewBox={TILT_VIEW} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={id('plate')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a919b" /><stop offset="1" stopColor="#5d646e" />
        </linearGradient>
        <pattern id={id('fins')} width="20" height="5" patternUnits="userSpaceOnUse">
          <rect width="20" height="5" fill="#121418" /><rect width="20" height="1.8" fill="#3a3f47" />
        </pattern>
      </defs>
      <rect x="150" y="106" width="14" height="188" rx="4" fill="#30353d" stroke={edge} strokeWidth="1.5" />
      <rect x="146" y="128" width="6" height="56" rx="2" fill="#1c1f24" />
      <rect x="146" y="214" width="6" height="56" rx="2" fill="#1c1f24" />
      <rect x="164" y="110" width="58" height="180" fill={`url(#${id('fins')})`} stroke="#2a2e35" strokeWidth="1" />
      <rect x="222" y="106" width="7" height="188" fill="#1f3b2c" />
      <rect x="229" y="106" width="21" height="188" rx="3" fill={`url(#${id('plate')})`} stroke={edge} strokeWidth="1.5" />
    </svg>
  );
}

/** The two sides' names, level with the middle of the card on either side of the upright line; they hold still while the card leans. */
export function AstralTiltLabels({ fans, backplate }: { fans: string; backplate: string }) {
  return (
    <svg viewBox={TILT_VIEW} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <text x={TILT_PIVOT[0] - 70} y="207" textAnchor="end" fontFamily={FONT} fontSize="19" fill="#9ca3af">{fans}</text>
      <text x={TILT_PIVOT[0] + 70} y="207" textAnchor="start" fontFamily={FONT} fontSize="19" fill="#9ca3af">{backplate}</text>
    </svg>
  );
}

const PLUS = '+';
const MINUS = '−';

interface ArcArrowProps {
  viewBox: string;
  cx: number;
  cy: number;
  r: number;
  /** From a0 to a1 in degrees, screen convention (0 = right, +90 = down); the + end is at a1. */
  a0: number;
  a1: number;
  color: string;
  /** Which end lights up: 1 the + end, -1 the - end, 0 neither. */
  on: -1 | 0 | 1;
  warn: boolean;
  signGap?: number;
}

/** A curved double arrow on a circle around (cx, cy). The end the card moved toward fills with the colour and grows a little. */
export function AstralArcArrow({ viewBox, cx, cy, r, a0, a1, color, on, warn, signGap = 30 }: ArcArrowProps) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const at = (a: number, rr = r): [number, number] => [cx + rr * Math.cos(rad(a)), cy + rr * Math.sin(rad(a))];
  const n = (v: number) => v.toFixed(1);
  const lit = warn ? '#ef4444' : color;
  const head = 18;
  // Leave room for the heads at both ends; the heads point along the arc.
  const span = a1 - a0;
  const trim = (head / r) * (180 / Math.PI) * Math.sign(span);
  const s0 = at(a0 + trim);
  const s1 = at(a1 - trim);
  const large = Math.abs(span - 2 * trim) > 180 ? 1 : 0;
  const sweep = span > 0 ? 1 : 0;
  const arc = `M${n(s0[0])} ${n(s0[1])} A${r} ${r} 0 ${large} ${sweep} ${n(s1[0])} ${n(s1[1])}`;
  const arrowHead = (a: number, dir: number, active: boolean) => {
    // The tangent of an increasing angle is (-sin, cos); the + end points along it, the - end against.
    const tx = -Math.sin(rad(a)) * dir;
    const ty = Math.cos(rad(a)) * dir;
    const tip = at(a);
    const size = active ? head * 1.15 : head;
    const base = [tip[0] - tx * size, tip[1] - ty * size];
    const w = size * 0.62;
    const d = `M${n(tip[0])} ${n(tip[1])} L${n(base[0] - ty * w)} ${n(base[1] + tx * w)} `
      + `Q${n(base[0] + tx * size * 0.25)} ${n(base[1] + ty * size * 0.25)} ${n(base[0] + ty * w)} ${n(base[1] - tx * w)} Z`;
    return <path d={d} fill={active ? lit : '#6b7280'} />;
  };
  const sign = (a: number, text: string, active: boolean): ReactNode => {
    const p = at(a, r + signGap);
    return (
      <g>
        <circle cx={n(p[0])} cy={n(p[1])} r="15" fill={active ? lit : '#2a2e35'} stroke={active ? lit : '#4b525c'} strokeWidth="1.5" />
        <text x={n(p[0])} y={n(p[1] + 6.5)} textAnchor="middle" fontFamily={FONT} fontSize="20" fontWeight="700"
          fill={active ? '#0b0c0f' : '#cbd2db'}>{text}</text>
      </g>
    );
  };
  return (
    <svg viewBox={viewBox} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={arc} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeOpacity="0.18" />
      <path d={arc} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeOpacity="0.75" />
      {arrowHead(a1, Math.sign(span), on > 0)}
      {arrowHead(a0, -Math.sign(span), on < 0)}
      {sign(a1, PLUS, on > 0)}
      {sign(a0, MINUS, on < 0)}
    </svg>
  );
}

// ── Power detector ──────────────────────────────────────────────────────────────

// GPU Tweak III's own colours for its pin dots and warning sign.
const GT_GREEN = '#03FC84';
const GT_YELLOW = '#FBB03B';
const GT_RED = '#FF0000';
const GT_WARNING = '#FF5555';
const PIN_COLOUR: Record<PinState, string> = { green: GT_GREEN, yellow: GT_YELLOW, red: GT_RED };
const CONNECTOR_NAME = '12V-2X6';
const PIN_RAIL = '12V';

interface ConnectorProps extends PinLimits {
  /** Each 12V pin's current in amps, pin 1 first. */
  pins: readonly number[];
  label: string;
}

/**
 * The card's 12V-2x6 connector seen from the front, headed by its state as GPU Tweak
 * shows it: the latch on top over the six 12V pins (with their reading), the six
 * ground pins under them, the four sense pins at the bottom and the pin numbers below.
 */
export function AstralConnector({ pins, label, ...limits }: ConnectorProps) {
  const cell = 74;
  const gap = 14;
  const x0 = 320 - (6 * cell + 5 * gap) / 2;
  const values = [0, 1, 2, 3, 4, 5].map(i => (typeof pins[i] === 'number' && Number.isFinite(pins[i]) ? pins[i] : 0));
  const states = values.map(v => pinState(v, limits));
  const status = connectorState(states);
  const warn = status === 'red' ? GT_WARNING : GT_YELLOW;
  return (
    <svg viewBox="0 0 640 340" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={label}>
      {status === 'green' ? (
        <g>
          <circle cx="268" cy="25" r="13" fill="none" stroke={GT_GREEN} strokeWidth="2.6" />
          <path d="M261.5 25.5 L266.5 30.5 L275 20.5" fill="none" stroke={GT_GREEN} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : (
        <g>
          <path d="M268 11 L282 37 H254 Z" fill="none" stroke={warn} strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M268 20 V28" stroke={warn} strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="268" cy="32.5" r="1.7" fill={warn} />
        </g>
      )}
      <text x="292" y="33" fontFamily={FONT} fontSize="22" fontWeight="700" fill={status === 'green' ? '#ffffff' : warn}>{CONNECTOR_NAME}</text>
      <g transform="translate(0 56)">
        <rect x="276" y="10" width="88" height="24" rx="5" fill="#2a2e35" stroke="#4b525c" strokeWidth="2" />
        <rect x="34" y="30" width="572" height="178" rx="16" fill="#1c1f24" stroke="#4b525c" strokeWidth="2.5" />
        {values.map((v, i) => {
          const x = x0 + i * (cell + gap);
          const fill = PIN_COLOUR[states[i]];
          return (
            <g key={i}>
              <rect x={x} y="46" width={cell} height="72" rx="8" fill={fill} fillOpacity="0.16" stroke={fill} strokeWidth="2.5" />
              <text x={x + cell / 2} y="77" textAnchor="middle" fontFamily={FONT} fontSize="15" fill="#cbd2db">{PIN_RAIL}</text>
              <text x={x + cell / 2} y="104" textAnchor="middle" fontFamily={FONT} fontSize="20" fontWeight="700" fill="#f3f4f6">{ampsText(v)}</text>
              <rect x={x} y="128" width={cell} height="64" rx="8" fill="#2a2e35" stroke="#3a3f47" strokeWidth="2" />
              <rect x={x + cell / 2 - 13} y="147" width="26" height="26" rx="4" fill="#0b0c0f" />
              <text x={x + cell / 2} y="268" textAnchor="middle" fontFamily={FONT} fontSize="17" fill="#9ca3af">{i + 1}</text>
            </g>
          );
        })}
        {/* the sense pins sit in a strip of their own below the ground row */}
        <rect x="214" y="208" width="212" height="22" rx="6" fill="#1c1f24" stroke="#4b525c" strokeWidth="2" />
        {[0, 1, 2, 3].map(i => <rect key={i} x={236 + i * 46} y="213" width="30" height="12" rx="3" fill="#0b0c0f" />)}
      </g>
    </svg>
  );
}

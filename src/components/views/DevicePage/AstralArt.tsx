// Flat drawings of a ROG Astral card for its device page, plain SVG: the card from
// the side and from its end (Level Sense turns them), the curved arrows that light up
// the way the card moved, and the card's 12V-2x6 power connector with each pin's
// current in GPU Tweak III's colors (Power detector).
import { useId, type ReactNode } from 'react';
import { connectorTone, type PinTone, type StageExtent } from './astralUtils';

// Ids inside an inline SVG are page-wide, so each drawing prefixes its own.
function useSvgIds(): (name: string) => string {
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (name: string) => `${base}-${name}`;
}

const FONT = 'Segoe UI, Arial, sans-serif';

// ── Level Sense ─────────────────────────────────────────────────────────────────

// Real card proportions, flat shapes: the body spans x 30..478 and y 40..227. The side
// view turns about the bracket, so it is shown through a square centered there.
const BODY = { l: 30, t: 40, r: 478, b: 227, cy: 133 };
export const SAG_PIVOT = [22, BODY.cy] as const;
const SAG_HALF = 540;
export const SAG_VIEW = `${SAG_PIVOT[0] - SAG_HALF} ${SAG_PIVOT[1] - SAG_HALF} ${2 * SAG_HALF} ${2 * SAG_HALF}`;
/** The side view plus its arrow, in view units. */
export const SAG_EXTENT: StageExtent = { x0: 14, x1: 548, y0: 40, y1: 243, half: SAG_HALF, pivot: SAG_PIVOT };

// The end view leans about the bottom edge, where the card sits in its PCIe slot.
export const TILT_PIVOT = [147, BODY.b] as const;
const TILT_HALF = 300;
export const TILT_VIEW = `${TILT_PIVOT[0] - TILT_HALF} ${TILT_PIVOT[1] - TILT_HALF} ${2 * TILT_HALF} ${2 * TILT_HALF}`;
/** Symmetric about the slot, so the upright line runs through the middle of the card. */
export const TILT_EXTENT: StageExtent = { x0: 147 - 165, x1: 147 + 165, y0: -50, y1: 233, half: TILT_HALF, pivot: TILT_PIVOT };

const FRAME = '#23272d';
const EDGE = '#4b525c';
const PLATE = '#8b929c';
const DARK = '#0d0f12';
const METAL = '#9aa1ab';

// One fan, drawn once as a symbol: frame ring, swept blades and the hub.
const BLADES = Array.from({ length: 11 }, (_, i) => (i * 360) / 11);
const BLADE = 'M0 -12 C11 -19 15 -31 9 -41 L-1 -41 C3 -31 -1 -21 -9 -10 Z';

/** Fan side of a triple-fan card: bracket on the left, plate behind the fans, PCIe fingers below. */
export function AstralSideView() {
  const id = useSvgIds();
  return (
    <svg viewBox={SAG_VIEW} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <path id={id('blade')} d={BLADE} fill="#3a3f47" stroke="#11141a" strokeWidth="0.8" />
        <symbol id={id('fan')} viewBox="-47 -47 94 94">
          <circle r="46" fill={DARK} stroke="#3a4048" strokeWidth="2" />
          {BLADES.map(a => <use key={a} href={`#${id('blade')}`} transform={`rotate(${a.toFixed(2)})`} />)}
          <circle r="12.5" fill="#5a616b" stroke={DARK} />
        </symbol>
      </defs>
      <path d="M14 70 H30 V252 H20 V246 H14 Z" fill={METAL} />
      {/* PCIe edge connector with its key notch */}
      <path d="M95 227 H215 V243 H124 V237 H118 V243 H95 Z" fill="#cbd2db" />
      <rect x={BODY.l} y={BODY.t} width={BODY.r - BODY.l} height={BODY.b - BODY.t} rx="9" fill={FRAME} stroke={EDGE} strokeWidth="1.5" />
      <path d="M38 52 H290 L338 98 V215 H38 Z" fill={PLATE} strokeLinejoin="round" />
      {[104, 251, 400].map(x => <use key={x} href={`#${id('fan')}`} x={x - 74} y={BODY.cy - 74} width="148" height="148" />)}
    </svg>
  );
}

/** The card seen from its free end: the fan shroud, the fin stack and the backplate. */
export function AstralEndView() {
  const id = useSvgIds();
  const x = 100;
  return (
    <svg viewBox={TILT_VIEW} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <pattern id={id('fins')} width="20" height="5" patternUnits="userSpaceOnUse">
          <rect width="20" height="5" fill={DARK} /><rect width="20" height="1.6" fill="#3a3f47" />
        </pattern>
      </defs>
      <rect x={x} y={BODY.t} width="95" height={BODY.b - BODY.t} rx="5" fill={FRAME} stroke={EDGE} strokeWidth="1.5" />
      <rect x={x + 26} y={BODY.t + 8} width="57" height={BODY.b - BODY.t - 16} fill={`url(#${id('fins')})`} stroke={EDGE} />
      <rect x={x + 84} y={BODY.t} width="11" height={BODY.b - BODY.t} rx="3" fill={PLATE} />
    </svg>
  );
}

/** The two sides' names, level with the middle of the card on either side of the upright line; they hold still while the card leans. */
export function AstralTiltLabels({ fans, backplate }: { fans: string; backplate: string }) {
  return (
    <svg viewBox={TILT_VIEW} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <text x={TILT_PIVOT[0] - 70} y="150" textAnchor="end" fontFamily={FONT} fontSize="19" fill="#9ca3af">{fans}</text>
      <text x={TILT_PIVOT[0] + 70} y="150" textAnchor="start" fontFamily={FONT} fontSize="19" fill="#9ca3af">{backplate}</text>
    </svg>
  );
}

// Neutral tones: the track, the lit end and the reading arc never carry a state color.
const LIT = '#cbd2db';
const TRACK = '#9ca3af';
/** The reading, in degrees, at which the reading arc reaches its end. */
const ARC_FULL_DEG = 1;

const PLUS = '+';
const MINUS = '-';

interface ArcArrowProps {
  viewBox: string;
  cx: number;
  cy: number;
  r: number;
  /** From a0 to a1 in degrees, screen convention (0 = right, +90 = down); the + end is at a1. */
  a0: number;
  a1: number;
  /** Which end lights up: 1 the + end, -1 the - end, 0 neither. */
  on: -1 | 0 | 1;
  /** The reading in degrees; an arc from the middle of the track toward the matching end grows with it. */
  value: number;
  signGap?: number;
}

/** A curved double arrow on a circle around (cx, cy). The end the card moved toward fills with the color and grows a little. */
export function AstralArcArrow({ viewBox, cx, cy, r, a0, a1, on, value, signGap = 30 }: ArcArrowProps) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const at = (a: number, rr = r): [number, number] => [cx + rr * Math.cos(rad(a)), cy + rr * Math.sin(rad(a))];
  const n = (v: number) => v.toFixed(1);
  const lit = LIT;
  const head = 18;
  // Leave room for the heads at both ends; the heads point along the arc.
  const span = a1 - a0;
  const trim = (head / r) * (180 / Math.PI) * Math.sign(span);
  const s0 = at(a0 + trim);
  const s1 = at(a1 - trim);
  const large = Math.abs(span - 2 * trim) > 180 ? 1 : 0;
  const sweep = span > 0 ? 1 : 0;
  const arc = `M${n(s0[0])} ${n(s0[1])} A${r} ${r} 0 ${large} ${sweep} ${n(s1[0])} ${n(s1[1])}`;
  // The reading arc starts at the middle of the track and runs toward the end the card moved to.
  const mid = (a0 + a1) / 2;
  const frac = Math.min(1, Math.abs(value) / ARC_FULL_DEG);
  const end = mid + (value > 0 ? a1 - mid : a0 - mid) * frac;
  const [m0, m1] = [at(mid), at(end)];
  const reading = on === 0 ? null : `M${n(m0[0])} ${n(m0[1])} A${r} ${r} 0 0 ${end > mid ? 1 : 0} ${n(m1[0])} ${n(m1[1])}`;
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
      <path d={arc} fill="none" stroke={TRACK} strokeWidth="12" strokeLinecap="round" strokeOpacity="0.18" />
      <path d={arc} fill="none" stroke={TRACK} strokeWidth="5" strokeLinecap="round" strokeOpacity="0.5" />
      {reading && <path d={reading} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" />}
      {arrowHead(a1, Math.sign(span), on > 0)}
      {arrowHead(a0, -Math.sign(span), on < 0)}
      {sign(a1, PLUS, on > 0)}
      {sign(a0, MINUS, on < 0)}
    </svg>
  );
}

// ── Power detector ──────────────────────────────────────────────────────────────

// GPU Tweak III's own colors for its pin dots and warning sign.
const GT_GREEN = '#03FC84';
const GT_YELLOW = '#FBB03B';
const GT_RED = '#FF0000';
const GT_WARNING = '#FF5555';
const PIN_COLOR: Record<PinTone, string> = { green: GT_GREEN, yellow: GT_YELLOW, red: GT_RED };
const CONNECTOR_NAME = '12V-2X6';
const PIN_RAIL = '12V';

interface ConnectorProps {
  /** Each 12V pin's current in amps and its tone, pin 1 first. */
  pins: readonly { amps: number; tone: PinTone; label: string }[];
  label: string;
}

/**
 * The card's 12V-2x6 connector seen from the front, headed by its state as GPU Tweak
 * shows it: the latch on top over the six 12V pins (with their reading), the six
 * ground pins under them, the four sense pins at the bottom and the pin numbers below.
 */
export function AstralConnector({ pins, label }: ConnectorProps) {
  const cell = 74;
  const gap = 14;
  const x0 = 320 - (6 * cell + 5 * gap) / 2;
  const values = [0, 1, 2, 3, 4, 5].map(i => (Number.isFinite(pins[i]?.amps) ? pins[i].amps : 0));
  const states = [0, 1, 2, 3, 4, 5].map(i => pins[i]?.tone ?? 'green');
  const status = connectorTone(states);
  const warn = status === 'red' ? GT_WARNING : GT_YELLOW;
  return (
    <svg viewBox="0 0 640 340" xmlns="http://www.w3.org/2000/svg" role="group" aria-label={label}>
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
          const fill = PIN_COLOR[states[i]];
          return (
            <g key={i} role="group" aria-label={pins[i]?.label}>
              <rect x={x} y="46" width={cell} height="72" rx="8" fill={fill} fillOpacity="0.16" stroke={fill} strokeWidth="2.5" />
              <text x={x + cell / 2} y="77" textAnchor="middle" fontFamily={FONT} fontSize="15" fill="#cbd2db">{PIN_RAIL}</text>
              <text x={x + cell / 2} y="104" textAnchor="middle" fontFamily={FONT} fontSize="20" fontWeight="700" fill="#f3f4f6">{`${v.toFixed(1)} A`}</text>
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

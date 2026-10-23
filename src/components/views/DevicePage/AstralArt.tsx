import { useId } from 'react';
import styles from './AstralDevicePage.module.scss';

// Degrees drawn per degree measured: real tilt is a fraction of a degree, so the art exaggerates it.
const GAIN = 8;
const MAX_DRAW = 14;
const draw = (deg: number) => Math.max(-MAX_DRAW, Math.min(MAX_DRAW, deg * GAIN));

// The side view turns about the bracket, the end view about the slot edge it stands in.
const SIDE = { box: '0 0 460 400', pivot: '28px 205px', ref: [28, 205] } as const;
const END = { box: '0 0 396 300', pivot: '198px 294px', ref: [198, 294] } as const;

const BLADES = Array.from({ length: 11 }, (_, i) => (i * 360) / 11);
const BLADE = 'M0 -12 C11 -19 15 -31 9 -41 L-1 -41 C3 -31 -1 -21 -9 -10 Z';

/** The card from the side (sag) or from its end (lean), turned by the reading. */
export function AstralArt({ view, degrees, label }: { view: 'side' | 'end'; degrees: number; label: string }) {
  const k = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const u = (name: string) => `url(#${k}-${name})`;
  const side = view === 'side';
  const { box, pivot, ref } = side ? SIDE : END;
  return (
    <svg className={styles.art} viewBox={box} role="img" aria-label={label}>
      <defs>
        {side ? (
          <>
            <linearGradient id={`${k}-shroud`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3d424b" /><stop offset="0.55" stopColor="#262a30" /><stop offset="1" stopColor="#1a1d22" />
            </linearGradient>
            <linearGradient id={`${k}-metal`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#d7dbe1" /><stop offset="0.5" stopColor="#9aa1ab" /><stop offset="1" stopColor="#6d747e" />
            </linearGradient>
            <linearGradient id={`${k}-back`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6b727c" /><stop offset="1" stopColor="#2b2f35" />
            </linearGradient>
            <linearGradient id={`${k}-band`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ff3fd2" /><stop offset="1" stopColor="#29c5ff" />
            </linearGradient>
            <linearGradient id={`${k}-frame`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#565d67" /><stop offset="1" stopColor="#1f2328" />
            </linearGradient>
            <linearGradient id={`${k}-blade`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#363b43" /><stop offset="1" stopColor="#1c1f24" />
            </linearGradient>
            <radialGradient id={`${k}-hub`} cx="0.4" cy="0.35" r="0.7">
              <stop offset="0" stopColor="#5a616b" /><stop offset="1" stopColor="#22262c" />
            </radialGradient>
            <pattern id={`${k}-fins`} width="4" height="20" patternUnits="userSpaceOnUse">
              <rect width="4" height="20" fill="#121418" /><rect width="1.6" height="20" fill="#3a3f47" />
            </pattern>
            <path id={`${k}-blade-path`} d={BLADE} fill={u('blade')} stroke="#11141a" strokeWidth="0.8" />
            <symbol id={`${k}-fan`} viewBox="-47 -47 94 94">
              <circle r="47" fill={u('frame')} />
              <circle r="43.5" fill="#090b0e" />
              {BLADES.map(a => <use key={a} href={`#${k}-blade-path`} transform={`rotate(${a.toFixed(2)})`} />)}
              <circle r="41" fill="none" stroke="#2c3138" strokeWidth="2.5" />
              <circle r="12.5" fill={u('hub')} stroke="#0c0e11" />
              <circle r="5" fill="#15181d" stroke="#5d646e" />
            </symbol>
          </>
        ) : (
          <>
            <linearGradient id={`${k}-plate`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8a919b" /><stop offset="1" stopColor="#5d646e" />
            </linearGradient>
            <pattern id={`${k}-fins`} width="20" height="5" patternUnits="userSpaceOnUse">
              <rect width="20" height="5" fill="#121418" /><rect width="20" height="1.8" fill="#3a3f47" />
            </pattern>
          </>
        )}
      </defs>
      <line className={styles.level} x1="0" y1={ref[1]} x2={box.split(' ')[2]} y2={ref[1]} />
      <g className={styles.tilt} style={{ transform: `rotate(${draw(degrees)}deg)`, transformOrigin: pivot }}>
        {side ? (
          <>
            <path d="M20 108 H36 V302 H26 V296 H20 Z" fill={u('metal')} />
            {[136, 168, 200, 232].map(y => <rect key={y} x="26" y={y} width="5" height="22" rx="2" fill="#5b616b" />)}
            <path d="M94 270 H236 V283 H124 V279 H120 V283 H94 Z" fill="#c9a227" />
            <rect x="40" y="250" width="344" height="22" fill={u('fins')} />
            <rect x="38" y="122" width="348" height="10" rx="2" fill={u('back')} />
            <rect x="44" y="130" width="334" height="14" rx="7" fill={u('band')} opacity="0.25" />
            <rect x="46" y="133" width="330" height="6" rx="3" fill={u('band')} />
            <path d="M44 140 H380 V242 L366 256 H214 L204 248 H62 L44 232 Z" fill={u('shroud')} stroke="#4b525c" strokeWidth="1.5" />
            <path d="M44 140 H176 L146 248 H62 L44 232 Z" fill="#fff" opacity="0.045" />
            <path d="M262 140 L240 172 M372 150 L352 178 M206 248 L214 240 H366" stroke="#8b93a0" strokeOpacity="0.35" strokeWidth="1.2" fill="none" />
            {[126, 226, 326].map(x => <use key={x} href={`#${k}-fan`} x={x - 47} y="148" width="94" height="94" />)}
          </>
        ) : (
          <>
            <rect x="150" y="106" width="14" height="188" rx="4" fill="#30353d" stroke="#4b525c" strokeWidth="1.5" />
            <rect x="146" y="128" width="6" height="56" rx="2" fill="#1c1f24" />
            <rect x="146" y="214" width="6" height="56" rx="2" fill="#1c1f24" />
            <rect x="164" y="110" width="58" height="180" fill={u('fins')} stroke="#2a2e35" />
            <rect x="222" y="106" width="7" height="188" fill="#1f3b2c" />
            <rect x="229" y="106" width="21" height="188" rx="3" fill={u('plate')} stroke="#4b525c" strokeWidth="1.5" />
          </>
        )}
      </g>
    </svg>
  );
}

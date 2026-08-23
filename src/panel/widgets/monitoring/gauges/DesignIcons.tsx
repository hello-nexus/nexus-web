// Each design icon is a tiny SVG component; co-locating them in one file
// makes the picker easy to scan and the array map() at the bottom trivial.
// Fast-refresh doesn't matter for these - they have no internal state.
 
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function AreaIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <path d="M3 17 L7 12 L11 14 L15 7 L19 10 L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 17 L7 12 L11 14 L15 7 L19 10 L21 8 L21 20 L3 20 Z" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

function LineIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <path d="M3 17 L7 12 L11 14 L15 7 L19 10 L21 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MicrobarsIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <rect x="2" y="14" width="2.5" height="7" rx="1" fill="currentColor" opacity="0.3" />
      <rect x="5.5" y="11" width="2.5" height="10" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="9" y="8" width="2.5" height="13" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="12.5" y="12" width="2.5" height="9" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="16" y="6" width="2.5" height="15" rx="1" fill="currentColor" opacity="0.85" />
      <rect x="19.5" y="9" width="2.5" height="12" rx="1" fill="currentColor" />
    </svg>
  );
}

function ProgressBarIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <rect x="2" y="10" width="20" height="4" rx="2" fill="currentColor" opacity="0.2" />
      <rect x="2" y="10" width="13" height="4" rx="2" fill="currentColor" />
    </svg>
  );
}

function BarsIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <rect x="8" y="18" width="8" height="2.5" rx="1" fill="currentColor" />
      <rect x="8" y="14" width="8" height="2.5" rx="1" fill="currentColor" />
      <rect x="8" y="10" width="8" height="2.5" rx="1" fill="currentColor" />
      <rect x="8" y="6" width="8" height="2.5" rx="1" fill="currentColor" opacity="0.2" />
      <rect x="8" y="2" width="8" height="2.5" rx="1" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

function ValueIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <text x="12" y="17" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="16" fill="currentColor">42</text>
    </svg>
  );
}

function NumberFillIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <text x="12" y="17" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="16" fill="currentColor" opacity="0.25">42</text>
      <clipPath id="nf-clip"><rect x="0" y="12" width="24" height="12" /></clipPath>
      <text x="12" y="17" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="16" fill="currentColor" clipPath="url(#nf-clip)">42</text>
    </svg>
  );
}

function RingIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M12 4 A8 8 0 0 1 20 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ThermometerIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <rect x="9" y="3" width="6" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <rect x="10.5" y="11" width="3" height="9" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function Arc270Icon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <path d="M5.6 18.4 A8 8 0 1 1 18.4 18.4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.2" />
      <path d="M5.6 18.4 A8 8 0 0 1 12 4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function WedgeIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.2" />
      <path d="M12 12 L12 4 A8 8 0 0 1 20 12 Z" fill="currentColor" />
    </svg>
  );
}

function BatteryIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <rect x="2" y="8" width="18" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <rect x="20.5" y="10" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.35" />
      <rect x="3.5" y="9.5" width="9" height="5" rx="0.8" fill="currentColor" />
    </svg>
  );
}

function DotGridIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <circle cx="5" cy="5" r="2" fill="currentColor" />
      <circle cx="12" cy="5" r="2" fill="currentColor" />
      <circle cx="19" cy="5" r="2" fill="currentColor" opacity="0.15" />
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" opacity="0.15" />
      <circle cx="5" cy="19" r="2" fill="currentColor" />
      <circle cx="12" cy="19" r="2" fill="currentColor" opacity="0.15" />
      <circle cx="19" cy="19" r="2" fill="currentColor" opacity="0.15" />
    </svg>
  );
}

function HalfGaugeIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <path d="M4 18 A8 8 0 0 1 20 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.15" />
      <path d="M4 18 A8 8 0 0 1 17.5 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function LiquidFillIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
      <clipPath id="lf-icon-clip"><circle cx="12" cy="12" r="8.5" /></clipPath>
      <g clipPath="url(#lf-icon-clip)">
        <rect x="3" y="11" width="18" height="10" fill="currentColor" opacity="0.5" />
        <path d="M3,11 Q7,9 12,11 Q17,13 21,11 L21,22 L3,22 Z" fill="currentColor" opacity="0.3" />
      </g>
    </svg>
  );
}

function SegmentsIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <rect x="2" y="9" width="2.4" height="6" rx="1" fill="currentColor" />
      <rect x="5.5" y="9" width="2.4" height="6" rx="1" fill="currentColor" />
      <rect x="9" y="9" width="2.4" height="6" rx="1" fill="currentColor" />
      <rect x="12.5" y="9" width="2.4" height="6" rx="1" fill="currentColor" />
      <rect x="16" y="9" width="2.4" height="6" rx="1" fill="currentColor" opacity="0.2" />
      <rect x="19.5" y="9" width="2.4" height="6" rx="1" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

function MirrorWaveIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <path
        d="M3 9 L7 5 L11 10 L15 6 L19 11 L21 8 L21 16 L19 13 L15 18 L11 14 L7 19 L3 15 Z"
        fill="currentColor"
        opacity="0.25"
      />
      <path d="M3 9 L7 5 L11 10 L15 6 L19 11 L21 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 15 L7 19 L11 14 L15 18 L19 13 L21 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeatmapIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <rect x="2" y="9" width="3" height="6" rx="1" fill="currentColor" opacity="0.2" />
      <rect x="6" y="9" width="3" height="6" rx="1" fill="currentColor" opacity="0.45" />
      <rect x="10" y="9" width="3" height="6" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="14" y="9" width="3" height="6" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="18" y="9" width="3" height="6" rx="1" fill="currentColor" />
    </svg>
  );
}

function DialIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <path d="M5 17 A8 8 0 1 1 19 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      <line x1="12" y1="13" x2="16" y2="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="13" r="1.8" fill="currentColor" />
    </svg>
  );
}

function TickRingIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="12" y1="3" x2="12" y2="5.5" />
        <line x1="17" y1="5" x2="15.4" y2="6.8" opacity="0.3" />
        <line x1="19" y1="10" x2="16.6" y2="10.8" opacity="0.3" />
        <line x1="17" y1="15" x2="15.4" y2="13.9" opacity="0.3" />
        <line x1="7" y1="15" x2="8.6" y2="13.9" />
        <line x1="5" y1="10" x2="7.4" y2="10.8" />
        <line x1="7" y1="5" x2="8.6" y2="6.8" />
      </g>
    </svg>
  );
}

function BackdropIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <path d="M3 16 L7 12 L11 14 L15 8 L19 11 L21 9 L21 20 L3 20 Z" fill="currentColor" opacity="0.18" />
      <text x="12" y="16" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="11" fill="currentColor">42</text>
    </svg>
  );
}

function FillIcon(p: P) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...p}>
      <rect x="2" y="4" width="20" height="16" rx="3.5" fill="currentColor" opacity="0.18" />
      <clipPath id="fill-icon-clip"><rect x="2" y="4" width="20" height="16" rx="3.5" /></clipPath>
      <rect x="2" y="4" width="12" height="16" fill="currentColor" opacity="0.32" clipPath="url(#fill-icon-clip)" />
      <text x="12" y="16" textAnchor="middle" fontFamily="sans-serif" fontWeight="800" fontSize="12" fill="currentColor">42</text>
    </svg>
  );
}

export const DESIGN_ICONS: Record<string, React.FC<P>> = {
  sparkline: AreaIcon,
  text: ValueIcon,
  waterLevel: LiquidFillIcon,
  caterpillar: RingIcon,
  thermo: ThermometerIcon,
  arc270: Arc270Icon,
  wedge: WedgeIcon,
  battery: BatteryIcon,
  bar: ProgressBarIcon,
  microbars: MicrobarsIcon,
  hbar: BarsIcon,
  dotgrid: DotGridIcon,
  halfgauge: HalfGaugeIcon,
  numberfill: NumberFillIcon,
  line: LineIcon,
  segments: SegmentsIcon,
  mirrorwave: MirrorWaveIcon,
  heatmap: HeatmapIcon,
  dial: DialIcon,
  tickring: TickRingIcon,
  backdrop: BackdropIcon,
  fill: FillIcon,
};

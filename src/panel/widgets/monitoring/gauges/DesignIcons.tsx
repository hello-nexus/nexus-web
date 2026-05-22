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
      <circle cx="17.5" cy="11" r="2" fill="currentColor" />
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
};

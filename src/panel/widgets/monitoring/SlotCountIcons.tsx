import type { SVGProps } from 'react';
import type { PanelWidgetSize } from '../../types';
import { isMicroLayout, isTwoColumnMicro, type SlotLayout } from './perfSlots';

type IconProps = SVGProps<SVGSVGElement>;

export function OneSquareSlotIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="10" cy="10" r="1.2" fill="currentColor" />
      <path d="M9.5 14H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

export function OneRectangleSlotIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="7" width="17" height="10" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="8" cy="12" r="1.2" fill="currentColor" />
      <path d="M11 12H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

export function TwoSquareSlotsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.25" y="7.75" width="8.5" height="8.5" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="12.25" y="7.75" width="8.5" height="8.5" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6.7" cy="10.6" r="0.95" fill="currentColor" />
      <circle cx="15.7" cy="10.6" r="0.95" fill="currentColor" />
      <path d="M6 13.5H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
      <path d="M15 13.5H18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

export function TwoRectangleSlotsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="4.5" width="17" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="13" width="17" height="6.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="7.4" cy="7.8" r="1" fill="currentColor" />
      <circle cx="7.4" cy="16.3" r="1" fill="currentColor" />
      <path d="M10.4 7.8H17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
      <path d="M10.4 16.3H17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

export function FourSlotsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="4" y="4" width="6.8" height="6.8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13.2" y="4" width="6.8" height="6.8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="4" y="13.2" width="6.8" height="6.8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13.2" y="13.2" width="6.8" height="6.8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="7.4" cy="7.4" r="1" fill="currentColor" />
      <circle cx="16.6" cy="7.4" r="1" fill="currentColor" />
      <circle cx="7.4" cy="16.6" r="1" fill="currentColor" />
      <circle cx="16.6" cy="16.6" r="1" fill="currentColor" />
    </svg>
  );
}

// Single-column Micro counts (3/4): the 6/8 icons without the middle column
// split, mirroring the single-column bar layout the widget renders.
export function ThreeRowsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="5" width="17" height="2.8" rx="1.4" fill="currentColor" />
      <rect x="3.5" y="10.6" width="17" height="2.8" rx="1.4" fill="currentColor" />
      <rect x="3.5" y="16.2" width="17" height="2.8" rx="1.4" fill="currentColor" />
    </svg>
  );
}

export function FourRowsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="3.8" width="17" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="3.5" y="8.5" width="17" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="3.5" y="13.2" width="17" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="3.5" y="17.9" width="17" height="2.4" rx="1.2" fill="currentColor" />
    </svg>
  );
}

// Wide Micro counts stacked in one column (6/8 on the tall 2x4): the widget
// keeps all rows in a single column there instead of splitting into two.
export function SixRowsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="3.2" width="17" height="2" rx="1" fill="currentColor" />
      <rect x="3.5" y="6.5" width="17" height="2" rx="1" fill="currentColor" />
      <rect x="3.5" y="9.8" width="17" height="2" rx="1" fill="currentColor" />
      <rect x="3.5" y="13.1" width="17" height="2" rx="1" fill="currentColor" />
      <rect x="3.5" y="16.4" width="17" height="2" rx="1" fill="currentColor" />
      <rect x="3.5" y="19.7" width="17" height="2" rx="1" fill="currentColor" />
    </svg>
  );
}

export function EightRowsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="2.6" width="17" height="1.6" rx="0.8" fill="currentColor" />
      <rect x="3.5" y="5.1" width="17" height="1.6" rx="0.8" fill="currentColor" />
      <rect x="3.5" y="7.6" width="17" height="1.6" rx="0.8" fill="currentColor" />
      <rect x="3.5" y="10.1" width="17" height="1.6" rx="0.8" fill="currentColor" />
      <rect x="3.5" y="12.6" width="17" height="1.6" rx="0.8" fill="currentColor" />
      <rect x="3.5" y="15.1" width="17" height="1.6" rx="0.8" fill="currentColor" />
      <rect x="3.5" y="17.6" width="17" height="1.6" rx="0.8" fill="currentColor" />
      <rect x="3.5" y="20.1" width="17" height="1.6" rx="0.8" fill="currentColor" />
    </svg>
  );
}

// Wide Micro counts (6/8 on 4x2): two columns of horizontal rows (3+3, 4+4),
// mirroring the two-column bar layout the widget renders.
export function SixSlotsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="5" width="7.5" height="2.8" rx="1.4" fill="currentColor" />
      <rect x="3.5" y="10.6" width="7.5" height="2.8" rx="1.4" fill="currentColor" />
      <rect x="3.5" y="16.2" width="7.5" height="2.8" rx="1.4" fill="currentColor" />
      <rect x="13" y="5" width="7.5" height="2.8" rx="1.4" fill="currentColor" />
      <rect x="13" y="10.6" width="7.5" height="2.8" rx="1.4" fill="currentColor" />
      <rect x="13" y="16.2" width="7.5" height="2.8" rx="1.4" fill="currentColor" />
    </svg>
  );
}

export function EightSlotsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="3.8" width="7.5" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="3.5" y="8.5" width="7.5" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="3.5" y="13.2" width="7.5" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="3.5" y="17.9" width="7.5" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="13" y="3.8" width="7.5" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="13" y="8.5" width="7.5" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="13" y="13.2" width="7.5" height="2.4" rx="1.2" fill="currentColor" />
      <rect x="13" y="17.9" width="7.5" height="2.4" rx="1.2" fill="currentColor" />
    </svg>
  );
}

// Hero: one wide slot across the top, two small ones beneath. Shares its count
// with the Micro 3-row layout, so it is drawn from the hero flag, not the count.
export function HeroSlotsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="4" width="17" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="13" width="8" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="12.5" y="13" width="8" height="7" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="7.4" cy="7.5" r="1" fill="currentColor" />
      <path d="M10.4 7.5H17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
      <circle cx="6.4" cy="15.6" r="0.9" fill="currentColor" />
      <circle cx="15.4" cy="15.6" r="0.9" fill="currentColor" />
      <path d="M5.9 18.1H9.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
      <path d="M14.9 18.1H18.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

// Wide hero (4x2): two large slots over three small ones.
export function HeroWideSlotsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="5" width="8" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12.5" y="5" width="8" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="13.5" width="5" height="5.5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9.5" y="13.5" width="5" height="5.5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="15.5" y="13.5" width="5" height="5.5" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

// Grid hero (4x4): four large slots in a 2x2 block over three small ones.
export function HeroGridSlotsIcon(props: IconProps) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.5" y="3" width="8" height="5.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12.5" y="3" width="8" height="5.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="9.5" width="8" height="5.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="12.5" y="9.5" width="8" height="5.5" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="16.5" width="5" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="9.5" y="16.5" width="5" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="15.5" y="16.5" width="5" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function SlotLayoutIcon({
  layout,
  size,
  ...props
}: IconProps & { layout: SlotLayout; size: PanelWidgetSize }) {
  const { count } = layout;
  if (layout.hero) {
    if (size === '4x2') return <HeroWideSlotsIcon {...props} />;
    if (size === '4x4') return <HeroGridSlotsIcon {...props} />;
    return <HeroSlotsIcon {...props} />;
  }
  // 6/8 split into two columns only on the wide 4x2; the tall 2x4 stacks them
  // in one column (single-column rows icons).
  if (count >= 8) return isTwoColumnMicro(size, count) ? <EightSlotsIcon {...props} /> : <EightRowsIcon {...props} />;
  if (count === 6) return isTwoColumnMicro(size, count) ? <SixSlotsIcon {...props} /> : <SixRowsIcon {...props} />;
  // Micro 3/4 render as a single column of rows (horizontal lines); count=4 on
  // 4x4 is the multi-sensor 2x2 grid instead, so gate on the Micro layout.
  if (isMicroLayout(size, count, layout.hero)) {
    return count === 3 ? <ThreeRowsIcon {...props} /> : <FourRowsIcon {...props} />;
  }
  if (count >= 4) return <FourSlotsIcon {...props} />;
  if (count === 2) {
    return size === '4x4' || size === '2x4' ? <TwoRectangleSlotsIcon {...props} /> : <TwoSquareSlotsIcon {...props} />;
  }
  return size === '4x2' || size === '2x4' ? <OneRectangleSlotIcon {...props} /> : <OneSquareSlotIcon {...props} />;
}

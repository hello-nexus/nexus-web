import type { SVGProps } from 'react';
import type { PanelWidgetSize } from '../../types';

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

export function SlotCountIcon({
  count,
  size,
  ...props
}: IconProps & { count: number; size: PanelWidgetSize }) {
  if (count >= 4) return <FourSlotsIcon {...props} />;
  if (count === 2) {
    return size === '4x4' || size === '2x4' ? <TwoRectangleSlotsIcon {...props} /> : <TwoSquareSlotsIcon {...props} />;
  }
  return size === '4x2' || size === '2x4' ? <OneRectangleSlotIcon {...props} /> : <OneSquareSlotIcon {...props} />;
}

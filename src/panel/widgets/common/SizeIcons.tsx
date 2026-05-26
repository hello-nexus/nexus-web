import type { SVGProps } from 'react';

 

type IconProps = SVGProps<SVGSVGElement>;

function OneByOne(props: IconProps) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="3.25" y="3.25" width="10.5" height="10.5" rx="3" stroke="currentColor" strokeWidth="2.5" fill="currentColor"/>
      <rect x="18.25" y="3.25" width="10.5" height="10.5" rx="3" stroke="currentColor" strokeWidth="2.5"/>
      <rect x="3.25" y="18.25" width="10.5" height="10.5" rx="3" stroke="currentColor" strokeWidth="2.5"/>
      <rect x="18.25" y="18.25" width="10.5" height="10.5" rx="3" stroke="currentColor" strokeWidth="2.5"/>
    </svg>
  );
}

function TwoByTwo(props: IconProps) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="5" y="5" width="22" height="22" rx="5" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="11.5" cy="11.5" r="2.5" fill="currentColor"/>
      <rect x="16.5" y="10" width="6" height="3" rx="1.5" fill="currentColor"/>
    </svg>
  );
}

function FourByTwo(props: IconProps) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="7" width="28" height="18" rx="4.5" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="9" cy="12.5" r="2.5" fill="currentColor"/>
      <rect x="14" y="11" width="10" height="3" rx="1.5" fill="currentColor"/>
    </svg>
  );
}

function TwoByFour(props: IconProps) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="7" y="2" width="18" height="28" rx="4.5" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="13" cy="8.5" r="2.5" fill="currentColor"/>
      <rect x="11" y="14.5" width="10" height="2.75" rx="1.375" fill="currentColor"/>
      <rect x="11" y="20" width="10" height="2.75" rx="1.375" fill="currentColor"/>
    </svg>
  );
}

function FourByFour(props: IconProps) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="4" y="2" width="24" height="28" rx="5" stroke="currentColor" strokeWidth="2.5"/>
      <circle cx="10.5" cy="8.5" r="2.5" fill="currentColor"/>
      <rect x="15.5" y="7" width="8" height="3" rx="1.5" fill="currentColor"/>
      <rect x="8" y="14.5" width="16" height="2.5" rx="1.25" fill="currentColor"/>
      <rect x="8" y="20" width="16" height="2.5" rx="1.25" fill="currentColor"/>
    </svg>
  );
}

export const SIZE_ICONS: Record<string, React.FC<IconProps>> = {
  '1x1': OneByOne,
  '2x2': TwoByTwo,
  '2x4': TwoByFour,
  '4x2': FourByTwo,
  '4x4': FourByFour,
};

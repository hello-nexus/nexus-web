import type { SVGProps } from 'react';

interface BuildIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  strokeWidth?: number | string;
  color?: string;
}

// Lucide-compatible mark for Build: a screw head; the filled cross is sized for the default stroke width.
export function BuildIcon({ size = 24, strokeWidth = 2, color = 'currentColor', ...rest }: BuildIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <circle cx="12" cy="12" r="10" />
      <path
        transform="rotate(15 12 12)"
        fill={color}
        stroke="none"
        d="M17.5 11A1 1 0 0 1 17.5 13H14.5L13 14.5V17.5A1 1 0 0 1 11 17.5V14.5L9.5 13H6.5A1 1 0 0 1 6.5 11H9.5L11 9.5V6.5A1 1 0 0 1 13 6.5V9.5L14.5 11Z"
      />
    </svg>
  );
}

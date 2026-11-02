import type { SVGProps } from 'react';

interface BuildIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  strokeWidth?: number | string;
  color?: string;
}

// Lucide-compatible mark for Build: a rounded square holding a stroked B.
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
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M9.5 7.5v9M9.5 7.5h3a2.25 2.25 0 0 1 0 4.5h-3M9.5 12h3.5a2.25 2.25 0 0 1 0 4.5H9.5" />
    </svg>
  );
}

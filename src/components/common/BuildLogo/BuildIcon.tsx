import type { SVGProps } from 'react';

interface BuildIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string;
  strokeWidth?: number | string;
  color?: string;
}

// Lucide-compatible mark for Build: a stroked B in a rounded square that fills the icon box.
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
      <rect x="1" y="1" width="22" height="22" rx="6" />
      <path d="M8.5 6.5v11M8.5 6.5h4a2.75 2.75 0 0 1 0 5.5h-4M8.5 12h4.5a2.75 2.75 0 0 1 0 5.5H8.5" />
    </svg>
  );
}

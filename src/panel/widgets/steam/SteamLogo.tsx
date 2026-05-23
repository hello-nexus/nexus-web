import { forwardRef } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

/**
 * Steam logo, drawn as a LucideIcon-compatible component so it slots
 * into AppMetadata.icon (typed `LucideIcon`) and flows through to the
 * sidebar pin renderer + the panel widget catalog.
 *
 * Stylized version of Valve's mark — outer ring + offset filled
 * "scope" disc + connecting rod + smaller open "target" circle. Drawn
 * on a 24x24 viewBox to match the Lucide icon set so visual weight
 * lines up with neighbouring icons at every size.
 */
export const SteamLogo: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(function SteamLogo(
  {
    size = 24,
    color = 'currentColor',
    strokeWidth = 2,
    absoluteStrokeWidth: _absoluteStrokeWidth,
    ...rest
  },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="9.2" cy="14" r="3.2" fill={color} stroke="none" />
      <line x1="11" y1="12" x2="16" y2="8.6" />
      <circle cx="16.2" cy="8.5" r="2.4" />
    </svg>
  );
});

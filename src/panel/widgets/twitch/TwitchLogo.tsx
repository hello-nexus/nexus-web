import { forwardRef } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

/**
 * Twitch logo (Ionicons v5 logo-twitch, MIT).
 *
 * Fill is currentColor so the mark inherits theme color, same as
 * SteamLogo. Typed as LucideIcon so it slots into AppMetadata.icon;
 * stroke* / absoluteStrokeWidth are accepted for type compat but unused.
 */
export const TwitchLogo: LucideIcon = forwardRef<SVGSVGElement, LucideProps>(function TwitchLogo(
  {
    size = 24,
    color = 'currentColor',
    // Discard strokeWidth / absoluteStrokeWidth so they don't reach the
    // <svg>; stroke props would warp this fill-based glyph.
    /* eslint-disable @typescript-eslint/no-unused-vars */
    strokeWidth: _strokeWidth,
    absoluteStrokeWidth: _absoluteStrokeWidth,
    /* eslint-enable @typescript-eslint/no-unused-vars */
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
      viewBox="0 0 512 512"
      fill={color}
      aria-hidden="true"
      {...rest}
    >
      <path d="M80,32,48,112V416h96v64h64l64-64h80L464,304V32ZM416,288l-64,64H256l-64,64V352H112V80H416Z" />
      <rect x="320" y="143" width="48" height="129" />
      <rect x="208" y="143" width="48" height="129" />
    </svg>
  );
});

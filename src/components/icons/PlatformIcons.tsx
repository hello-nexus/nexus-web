// Flat four-square mark (the modern Windows 11 style, not the older tilted
// flag). Hand-drawn, not a traced Microsoft asset.
export function WindowsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="8" height="8" />
      <rect x="13" y="3" width="8" height="8" />
      <rect x="3" y="13" width="8" height="8" />
      <rect x="13" y="13" width="8" height="8" />
    </svg>
  );
}

// The Apple logo mark, path from the CC0 simple-icons set (copyright-free;
// the mark itself remains an Apple trademark - shown here as nominative use
// on macOS download/platform affordances, the same way every download page
// labels its macOS build). Filled, so it stays readable at button sizes
// where lucide's thin outline glyph gets lost.
export function AppleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-2.298z" />
    </svg>
  );
}

// Plump penguin with belly, eyes, and beak carved out via even-odd fill
// (hand-drawn, not a trace of the Tux mascot artwork). Reads as a penguin in
// a single currentColor fill at small sizes.
export function TuxIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path
        fillRule="evenodd"
        d="M12 1.5c-2.9 0-4.7 2-4.7 4.8 0 1.3-.15 2.4-.7 3.6-.66 1.46-1.75 3-2.1 5.1-.3 1.8.03 3.6 1 4.9.6.8 1.4 1.4 2.35 1.7.63.2 1.3-.06 1.86-.34.7-.35 1.5-.56 2.29-.56s1.59.21 2.29.56c.56.28 1.23.55 1.86.34.95-.3 1.75-.9 2.35-1.7.97-1.3 1.3-3.1 1-4.9-.35-2.1-1.44-3.64-2.1-5.1-.55-1.2-.7-2.3-.7-3.6 0-2.8-1.8-4.8-4.7-4.8Zm-1.9 4.1a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm3.8 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm-1.9 3.1 1.6-.95c.5-.3 1.1.24.85.76L12 10.5l-2.45-1.99c-.25-.52.35-1.06.85-.76l1.6.95Zm0 3.3c2.1 0 3.5 1.9 3.5 4.2 0 2.3-1.4 3.8-3.5 3.8s-3.5-1.5-3.5-3.8c0-2.3 1.4-4.2 3.5-4.2Z"
      />
    </svg>
  );
}

/**
 * Platform-appropriate brand glyph for a ping-reported platform string.
 * 'linux' and any other value (including '') fall back to the Tux glyph.
 */
export function PlatformIcon({ platform, size = 14 }: { platform: string; size?: number }) {
  if (platform === 'windows') return <WindowsIcon size={size} />;
  if (platform === 'macos') return <AppleIcon size={size} />;
  return <TuxIcon size={size} />;
}

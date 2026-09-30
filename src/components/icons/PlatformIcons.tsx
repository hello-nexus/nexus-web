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

// The Android robot head, path from the CC0 simple-icons set (the mark itself
// remains a Google trademark - nominative use, labelling the Android app link).
export function AndroidIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0683-.7438-1.9118-1.8435-3.2928-2.7402-4.1836a12.1048 12.1048 0 0 0-2.1309-1.6875c.6594-1.122 1.312-2.2559 1.9649-3.3848.2077-.3615.1886-.7956-.0079-1.1191a1.1001 1.1001 0 0 0-.8515-.5332c-.5225-.0536-.9392.3128-1.0488.5449zm-.0391 8.461c.3944.5926.324 1.3306-.1563 1.6503-.4799.3197-1.188.0985-1.582-.4941-.3944-.5927-.324-1.3307.1563-1.6504.4727-.315 1.1812-.1086 1.582.4941zM7.207 13.5273c.4803.3197.5506 1.0577.1563 1.6504-.394.5926-1.1038.8138-1.584.4941-.48-.3197-.5503-1.0577-.1563-1.6504.4008-.6021 1.1087-.8106 1.584-.4941z" />
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

// Steam's mark, path from the CC0 simple-icons set (the mark itself remains a
// Valve trademark - nominative use, labelling which store a game came from).
export function SteamIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path
        fillRule="evenodd"
        d="M12 2a10 10 0 0 0-9.97 9.3l5.35 2.2a2.83 2.83 0 0 1 1.6-.5h.14l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.42v.12a2.83 2.83 0 0 1-5.6.5L2.36 14.8A10 10 0 1 0 12 2ZM7.9 15.15l1.22.5a2.14 2.14 0 1 0 1.18-2.9l1.27.53a1.58 1.58 0 1 1-1.22 2.9l-2.45-1.03Zm11.4-5.65a2.51 2.51 0 1 0-5.02 0 2.51 2.51 0 0 0 5.02 0Zm-4.4 0a1.89 1.89 0 1 1 3.78 0 1.89 1.89 0 0 1-3.78 0Z"
      />
    </svg>
  );
}

// Epic's shield with its E carved out via even-odd (hand-drawn to the mark's
// proportions, not a traced Epic asset). Nominative use, as above.
export function EpicIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path
        fillRule="evenodd"
        d="M4.6 2h14.8c.88 0 1.6.72 1.6 1.6v10.2c0 1.6-.9 2.6-2.6 3.5l-5.5 2.9c-.56.3-1.24.3-1.8 0l-5.5-2.9C3.9 16.4 3 15.4 3 13.8V3.6C3 2.72 3.72 2 4.6 2Zm4.2 4v9.2h6.4v-1.9h-4.3v-1.8h3.5V9.7h-3.5V7.9h4.2V6H8.8Z"
      />
    </svg>
  );
}

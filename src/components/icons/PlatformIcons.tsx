import { Apple } from 'lucide-react';

// Generic four-pane flag glyph (hand-drawn, not a traced Microsoft asset).
export function WindowsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M3 5.1 11 4v7.4H3Z" />
      <path d="M12 3.9 21 2.7v8.7h-9Z" />
      <path d="M3 12.6h8V20l-8-1.1Z" />
      <path d="M12 12.6h9v8.6l-9-1.2Z" />
    </svg>
  );
}

// Generic penguin silhouette (hand-drawn, not a trace of the Tux mascot artwork).
export function TuxIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="12" cy="6.5" r="3.4" />
      <path d="M6.6 21c-.7-3.6.2-8.6 1.9-10.9.9-1.2 2.1-1.8 3.5-1.8s2.6.6 3.5 1.8c1.7 2.3 2.6 7.3 1.9 10.9-.1.6-.8.9-1.4.7-1.2-.4-2.6-.6-4-.6s-2.8.2-4 .6c-.6.2-1.3-.1-1.4-.7Z" />
    </svg>
  );
}

/**
 * Platform-appropriate brand glyph for a ping-reported platform string.
 * 'linux' and any other value (including '') fall back to the Tux glyph.
 */
export function PlatformIcon({ platform, size = 14 }: { platform: string; size?: number }) {
  if (platform === 'windows') return <WindowsIcon size={size} />;
  if (platform === 'macos') return <Apple size={size} />;
  return <TuxIcon size={size} />;
}

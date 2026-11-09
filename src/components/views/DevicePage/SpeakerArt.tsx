// Plain SVG for the Logitech speaker page's Surround sound tab, laid out as G HUB does:
// each speaker facing the listener, the subwoofer, and the cross in the middle.
import { SPEAKER_FACING } from './speakerUtils';

const FONT = 'Segoe UI, Arial, sans-serif';

/** One speaker's icon, a ring with a speaker turned toward the listener, or the subwoofer's box. */
export function SpeakerIcon({ channel }: { channel: string }) {
  if (channel === 'subwoofer') {
    return (
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="4" y="4" width="56" height="56" rx="9" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="32" cy="32" r="15" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="32" cy="32" r="4.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <g transform={`rotate(${SPEAKER_FACING[channel] ?? 0} 32 32)`} fill="none" stroke="currentColor" strokeWidth="2.6">
        <path d="M19 27 H25 L33 20 V44 L25 37 H19 Z" strokeLinejoin="round" />
        <path d="M38 26 Q42 32 38 38" strokeLinecap="round" />
        <path d="M43 21 Q50 32 43 43" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** The listener's cross in the middle of the speakers, with the front and the back named. */
export function SurroundCross({ front, back }: { front: string; back: string }) {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <text x="60" y="14" textAnchor="middle" fontFamily={FONT} fontSize="13" fill="currentColor" opacity="0.8">{front}</text>
      <text x="60" y="116" textAnchor="middle" fontFamily={FONT} fontSize="13" fill="currentColor" opacity="0.8">{back}</text>
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M60 26 V94 M26 60 H94" />
        <path d="M52 34 L60 24 L68 34 M52 86 L60 96 L68 86 M34 52 L24 60 L34 68 M86 52 L96 60 L86 68" />
      </g>
    </svg>
  );
}

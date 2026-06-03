import { useEffect, useState } from 'react';
import { NexusWordmark } from '../components/icons/NexusBrand';

/**
 * Public pre-launch splash for hellonexus.com — shown only to visitors who have
 * never had a local Nexus detected (see the gate in App.tsx). Later this slot
 * becomes the onboarding flow; for now it's the coming-soon page.
 *
 * Layout: big colored mark, the NEXUS wordmark (same SVG as the sidebar
 * top-left) centered under it, then the teaser line.
 */
export function SplashPage() {
  // Gentle mount fade so the mark doesn't pop in. Plain opacity transition
  // (no keyframes / extra stylesheet) keeps this route self-contained.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div style={frame}>
      <div style={{ ...stack, opacity: shown ? 1 : 0 }}>
        {/* Colored brand mark (transparent ColorAlpha master), not the white
            currentColor NexusMark. Decorative: the wordmark below names it. */}
        <img src="/nexus-mark-color.png" alt="" width={200} height={200} style={mark} />
        <span style={wordmark}>
          <NexusWordmark height={44} />
        </span>
        <p style={tagline}>The next generation of Nexus is almost here.</p>
      </div>
    </div>
  );
}

const frame: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
  textAlign: 'center',
};

const stack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  transition: 'opacity 600ms ease',
};

const mark: React.CSSProperties = {
  width: 'min(45vw, 200px)',
  height: 'auto',
  marginBottom: 28,
};

// Wordmark inherits `color` via currentColor — same as the sidebar brand.
const wordmark: React.CSSProperties = {
  display: 'inline-flex',
  color: 'var(--text)',
};

const tagline: React.CSSProperties = {
  margin: '18px 0 0',
  fontSize: 'clamp(0.95rem, 2.4vw, 1.125rem)',
  color: 'var(--text-dim)',
  maxWidth: 440,
  lineHeight: 1.5,
};

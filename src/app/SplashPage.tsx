import { useEffect, useState } from 'react';

/**
 * Public pre-launch splash for hellonexus.com.
 *
 * Shown ONLY to ordinary web visitors (a production build served from a remote
 * origin). It never renders when the SPA is served by an installed local
 * service (isServedFromService → the real dashboard) nor inside the desktop
 * `--app` shell, and the gate in App.tsx sits AFTER every pairing / panel /
 * overlay route, so phone pairing is untouched. See the showSplash check there.
 */
export function SplashPage() {
  // Gentle mount fade so the big mark doesn't pop in. Plain opacity transition
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
            currentColor NexusMark. Decorative: the <h1> below carries the name,
            so an alt here would just double-announce "Nexus". */}
        <img src="/nexus-mark-color.png" alt="" width={200} height={200} style={mark} />
        <h1 style={name}>Nexus</h1>
        <p style={tagline}>The next generation of Nexus is almost here</p>
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

const name: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(2.25rem, 6vw, 3.25rem)',
  fontWeight: 800,
  letterSpacing: '-0.02em',
  lineHeight: 1,
};

const tagline: React.CSSProperties = {
  margin: '14px 0 0',
  fontSize: 'clamp(0.95rem, 2.4vw, 1.125rem)',
  color: 'var(--text-dim)',
  maxWidth: 420,
  lineHeight: 1.5,
};

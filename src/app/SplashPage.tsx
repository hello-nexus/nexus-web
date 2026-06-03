import { useEffect, useState } from 'react';
import { NexusWordmark } from '../components/icons/NexusBrand';

/**
 * Public pre-launch splash for hellonexus.com — the coming-soon page (later this
 * slot becomes onboarding). A big cursive "hello" sits diffused behind the
 * colored mark (an iPhone-welcome nod), with the NEXUS wordmark + teaser below.
 */
export function SplashPage() {
  // Gentle mount fade so the stack doesn't pop in.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div style={frame}>
      <style>{HELLO_STYLE}</style>
      {/* Diffused gradient "hello" glow behind the mark. Decorative only. */}
      <div className="nx-hello" aria-hidden="true">hello</div>
      <div style={{ ...stack, opacity: shown ? 1 : 0 }}>
        {/* Colored brand mark (transparent ColorAlpha master). Decorative: the
            wordmark below names it. */}
        <img src="/nexus-mark-color.png" alt="" width={200} height={200} style={mark} />
        <span style={wordmark}>
          <NexusWordmark height={40} />
        </span>
        <p style={tagline}>The next generation of Nexus is almost here.</p>
      </div>
    </div>
  );
}

// Scoped <style>: the blurred cursive word + its slow breathe. Inline styles
// can't express @keyframes, so a tiny self-contained stylesheet rides with the
// component. The word uses currentColor (--text) — white on the dark theme,
// dark on light — so it stays legible either way.
const HELLO_STYLE = `
.nx-hello {
  position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%);
  font-family: 'Great Vibes', cursive; line-height: 1; white-space: nowrap;
  font-size: min(32vw, 440px);
  color: var(--text);
  filter: blur(6px); opacity: .16; pointer-events: none; user-select: none;
  animation: nxHelloBreathe 6s ease-in-out infinite;
}
@keyframes nxHelloBreathe { 0%, 100% { opacity: .13 } 50% { opacity: .19 } }
@media (prefers-reduced-motion: reduce) { .nx-hello { animation: none } }
`;

const frame: React.CSSProperties = {
  position: 'relative',
  minHeight: '100dvh',
  overflow: 'hidden',
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
  position: 'relative',
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  transition: 'opacity 700ms ease',
};

const mark: React.CSSProperties = {
  width: 'min(34vw, 168px)',
  height: 'auto',
  marginBottom: 26,
  filter: 'drop-shadow(0 8px 40px rgba(255, 45, 120, 0.25))',
};

const wordmark: React.CSSProperties = {
  display: 'inline-flex',
  color: 'var(--text)',
};

const tagline: React.CSSProperties = {
  margin: '16px 0 0',
  fontSize: 'clamp(0.95rem, 2.4vw, 1.125rem)',
  color: 'var(--text-dim)',
  maxWidth: 440,
  lineHeight: 1.5,
};

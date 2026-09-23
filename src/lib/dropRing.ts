// Drop-confirmation pulse: a short accent ring the size + shape of the element
// just dropped (matching its border-radius) that expands slightly outward and
// fades, like a glow ring. Shared by every drag-to-reorder surface (panel
// widgets, device-page panel, cooling / lighting / profile cards) so a drop
// reads the same everywhere. Self-contained: portals one node to <body>,
// animates via the Web Animations API, and removes itself on finish.

export function spawnDropRing(el: HTMLElement | null | undefined): void {
  if (!el || typeof document === 'undefined') return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const ring = document.createElement('div');
  ring.setAttribute('aria-hidden', 'true');
  const s = ring.style;
  s.position = 'fixed';
  s.left = `${rect.left}px`;
  s.top = `${rect.top}px`;
  s.width = `${rect.width}px`;
  s.height = `${rect.height}px`;
  // Match the card's corners so the ring traces its shape.
  s.borderRadius = getComputedStyle(el).borderRadius || '0px';
  s.border = '2px solid var(--accent)';
  s.boxShadow = '0 0 14px var(--accent-glow-shadow)';
  s.boxSizing = 'border-box';
  s.pointerEvents = 'none';
  s.zIndex = '9999';
  s.transformOrigin = 'center';
  s.willChange = 'transform, opacity';
  document.body.appendChild(ring);

  const frames: Keyframe[] = [
    { transform: 'scale(1)', opacity: 0.85 },
    { transform: 'scale(1.16)', opacity: 0 },
  ];
  const anim = ring.animate(frames, { duration: 440, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' });
  const done = () => ring.remove();
  anim.onfinish = done;
  anim.oncancel = done;
}

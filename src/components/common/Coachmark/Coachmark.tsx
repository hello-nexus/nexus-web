import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '../Button/Button';
import styles from './Coachmark.module.scss';

export type CoachmarkSide = 'top' | 'bottom' | 'left' | 'right';

/** An element, a ref to one, or a function returning the allowed rectangle. */
export type CoachmarkBoundary = HTMLElement | RefObject<HTMLElement | null> | (() => DOMRect | null);

export interface CoachmarkProps {
  /** Stable id of the hint, the same id given to useOnboardingHint. */
  hintId: string;
  /** The element to point at: a CSS selector (usually a data-coachmark attribute) or a ref. */
  target: string | RefObject<HTMLElement | null>;
  title: string;
  body?: string;
  dismissLabel: string;
  onDismiss: () => void;
  /** Preferred placement; flips to the opposite side, then the others, when it does not fit. */
  placement?: CoachmarkSide;
  /**
   * Area the bubble must stay inside, such as a page's content below its tab
   * row. When no placement fits inside it the bubble hides instead of
   * overlapping what lies outside. Defaults to the viewport, where the bubble
   * is moved to fit rather than hidden.
   */
  boundary?: CoachmarkBoundary;
}

export interface Bounds { left: number; top: number; right: number; bottom: number }
/** Distances in px: `margin` to the bounds, `offset` from the target, `arrowEdge` the arrow keeps from a bubble end. */
export interface Geometry { margin: number; offset: number; arrowEdge: number }
export const DEFAULT_GEOMETRY: Geometry = { margin: 8, offset: 16, arrowEdge: 22 };
interface Placed { side: CoachmarkSide; left: number; top: number; arrow: number; ring: DOMRect }

const MODAL_SELECTOR = '[role="alertdialog"], [aria-modal="true"]';
const OPPOSITE: Record<CoachmarkSide, CoachmarkSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

function fits(side: CoachmarkSide, t: DOMRect, w: number, h: number, b: Bounds, offset: number): boolean {
  if (side === 'bottom') return t.bottom + offset + h <= b.bottom && w <= b.right - b.left;
  if (side === 'top') return t.top - offset - h >= b.top && w <= b.right - b.left;
  if (side === 'right') return t.right + offset + w <= b.right && h <= b.bottom - b.top;
  return t.left - offset - w >= b.left && h <= b.bottom - b.top;
}

const contains = (b: Bounds, t: DOMRect) => t.left >= b.left && t.right <= b.right && t.top >= b.top && t.bottom <= b.bottom;

const px = (v: string, fallback: number) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };

/** Distances derived from the CSS tokens, so the arrow clears the bubble's rounded corner. */
function readGeometry(bubble: HTMLElement): Geometry {
  const root = getComputedStyle(document.documentElement);
  const arrow = bubble.querySelector<HTMLElement>('[data-coachmark-arrow]');
  const arrowSize = arrow ? arrow.offsetWidth : 0;
  const radius = px(getComputedStyle(bubble).borderTopLeftRadius, 0);
  if (!arrowSize || !radius) return DEFAULT_GEOMETRY;
  return {
    margin: px(root.getPropertyValue('--space-sm'), DEFAULT_GEOMETRY.margin),
    offset: arrowSize + px(root.getPropertyValue('--space-xs'), 4),
    arrowEdge: radius + arrowSize,
  };
}

/**
 * Pure placement: picks the first side that fits inside the bounds, keeps the
 * bubble inside them and aims the arrow at the target's center. With `strict`
 * it returns null when no side fits; otherwise it falls back to the preferred
 * side and clamps.
 */
export function placeCoachmark(
  t: DOMRect, w: number, h: number, bounds: Bounds, preferred: CoachmarkSide, strict = false, geo: Geometry = DEFAULT_GEOMETRY,
): Omit<Placed, 'ring'> | null {
  const { margin, offset, arrowEdge } = geo;
  const b = { left: bounds.left + margin, top: bounds.top + margin, right: bounds.right - margin, bottom: bounds.bottom - margin };
  // A target outside the boundary gets no bubble: it would point at something the page hides.
  if (strict && !contains(bounds, t)) return null;
  const perpendicular: CoachmarkSide[] = preferred === 'top' || preferred === 'bottom' ? ['right', 'left'] : ['bottom', 'top'];
  const found = [preferred, OPPOSITE[preferred], ...perpendicular].find(s => fits(s, t, w, h, b, offset));
  if (!found && strict) return null;
  const side = found ?? preferred;
  const cx = t.left + t.width / 2;
  const cy = t.top + t.height / 2;
  if (side === 'top' || side === 'bottom') {
    const left = clamp(cx - w / 2, b.left, b.right - w);
    const top = side === 'bottom' ? t.bottom + offset : t.top - offset - h;
    return { side, left, top: clamp(top, b.top, b.bottom - h), arrow: clamp(cx - left, arrowEdge, w - arrowEdge) };
  }
  const top = clamp(cy - h / 2, b.top, b.bottom - h);
  const left = side === 'right' ? t.right + offset : t.left - offset - w;
  return { side, left: clamp(left, b.left, b.right - w), top, arrow: clamp(cy - top, arrowEdge, h - arrowEdge) };
}

function resolveTarget(target: CoachmarkProps['target'], warn = false): HTMLElement | null {
  if (typeof target !== 'string') return target.current;
  const all = document.querySelectorAll<HTMLElement>(target);
  if (warn && import.meta.env.DEV && all.length > 1) {
    console.warn(`Coachmark: "${target}" matches ${all.length} elements; pointing at the first.`);
  }
  return all[0] ?? null;
}

/**
 * Where to mount the bubble so it shares the target's stacking context: the
 * outermost ancestor that isolates (the app layout), where in-flow dropdowns
 * live too, so they out-rank the bubble. Body when nothing isolates, or when
 * that ancestor would turn position: fixed into something relative to itself.
 */
function stackingRoot(el: HTMLElement): HTMLElement {
  let found: HTMLElement | null = null;
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).isolation === 'isolate') found = n;
  }
  if (!found) return document.body;
  const cs = getComputedStyle(found);
  const moves = (cs.transform !== 'none' && cs.transform !== '') || (cs.filter !== 'none' && cs.filter !== '') || (cs.perspective !== 'none' && cs.perspective !== '');
  return moves ? document.body : found;
}

function resolveBoundary(boundary: CoachmarkBoundary | undefined, viewport: Bounds): Bounds {
  if (!boundary) return viewport;
  const r = typeof boundary === 'function' ? boundary()
    : (boundary instanceof HTMLElement ? boundary : boundary.current)?.getBoundingClientRect() ?? null;
  if (!r) return viewport;
  return {
    left: Math.max(viewport.left, r.left), top: Math.max(viewport.top, r.top),
    right: Math.min(viewport.right, r.right), bottom: Math.min(viewport.bottom, r.bottom),
  };
}

/**
 * THE standard way to show a one-time onboarding hint. Do not build a banner
 * or a one-off bubble for a hint; point this at the real control instead.
 *
 * A floating bubble with an arrow at the target, a ring around the target and
 * an X. It floats over the page, so showing or hiding it never moves layout.
 * It is mounted in the target's own stacking context, below the dropdowns,
 * menus and popovers that live there, and portaled ones and modals sit above
 * the whole page. It follows the target on resize, scroll and re-mount, flips
 * to the opposite side when the preferred one has no room, and stays inside
 * the viewport (and `boundary`, when given). It shows nothing while the target
 * is missing, unsized, scrolled out of view, clipped or outside `boundary`, or
 * while a modal dialog is open. When it appears, a polite live region reads
 * out its title and body once; the target's own aria attributes are untouched.
 *
 * Pair it with useOnboardingHint(hintId), which keeps the dismissed flag on the
 * service: mount the Coachmark only while `dismissed === false`, and call
 * `dismiss` from onDismiss and from the target's own action. The X is the only
 * control inside the bubble; Escape deliberately does nothing here, since it
 * belongs to whatever else is open.
 */
// Frames the target must hold still, and the longest a follow may run.
const FOLLOW_STILL_FRAMES = 6;
const FOLLOW_MAX_MS = 1500;

export function Coachmark({ hintId, target, title, body, dismissLabel, onDismiss, placement = 'bottom', boundary }: CoachmarkProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [root, setRoot] = useState<HTMLElement>(() => document.body);
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef(false);
  const targetInView = useRef(true);
  const titleId = useId();
  const bodyId = useId();
  const boundaryRef = useRef(boundary);
  boundaryRef.current = boundary;

  const reposition = useCallback(() => {
    const el = resolveTarget(target);
    const bubble = bubbleRef.current;
    if (!el || !bubble || !targetInView.current || document.querySelector(MODAL_SELECTOR)) { setPlaced(null); return; }
    const t = el.getBoundingClientRect();
    if (t.width === 0 || t.height === 0) { setPlaced(null); return; }
    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const bounds = resolveBoundary(boundaryRef.current, viewport);
    const p = placeCoachmark(t, bubble.offsetWidth, bubble.offsetHeight, bounds, placement, boundaryRef.current !== undefined, readGeometry(bubble));
    if (!p) { setPlaced(null); return; }
    setPlaced(prev => (prev && prev.side === p.side && prev.left === p.left && prev.top === p.top && prev.arrow === p.arrow
      && prev.ring.left === t.left && prev.ring.top === t.top && prev.ring.width === t.width && prev.ring.height === t.height
      ? prev : { ...p, ring: t }));
  }, [target, placement]);

  // Observers keep the placement current: the target's and bubble's size, the
  // page, the window, and the DOM itself, which also notices the target
  // re-mounting as a new node and a modal or popover portal coming or going.
  useLayoutEffect(() => {
    const ro = new ResizeObserver(reposition);
    ro.observe(document.body);
    if (bubbleRef.current) ro.observe(bubbleRef.current);
    let observed: HTMLElement | null = null;
    let io: IntersectionObserver | null = null;
    let first = true;
    const sync = () => {
      const el = resolveTarget(target, first);
      first = false;
      if (el !== observed) {
        if (observed) ro.unobserve(observed);
        io?.disconnect();
        io = null;
        observed = el;
        targetInView.current = true;
        if (el) {
          ro.observe(el);
          setRoot(prev => { const next = stackingRoot(el); return prev === next ? prev : next; });
          if (typeof IntersectionObserver !== 'undefined') {
            io = new IntersectionObserver(entries => {
              const last = entries[entries.length - 1];
              targetInView.current = !!last && last.isIntersecting && last.intersectionRatio >= 0.5;
              reposition();
            }, { threshold: [0, 0.5, 1] });
            io.observe(el);
          }
        }
      }
      reposition();
    };
    sync();
    // A class toggle can move the target without resizing it or the body (the
    // sidebar collapsing shifts the page), so attribute changes and transition
    // events start a short follow loop. It re-measures each frame and stops
    // once the target has held still for a few frames or a cap is reached, so
    // nothing polls while idle and no end event is needed.
    let raf = 0;
    const follow = () => {
      if (raf) cancelAnimationFrame(raf);
      const startedAt = performance.now();
      let last = '';
      let still = 0;
      const tick = () => {
        reposition();
        const r = resolveTarget(target)?.getBoundingClientRect();
        const key = r ? `${r.left},${r.top},${r.width},${r.height}` : '';
        still = key === last ? still + 1 : 0;
        last = key;
        raf = still < FOLLOW_STILL_FRAMES && performance.now() - startedAt < FOLLOW_MAX_MS ? requestAnimationFrame(tick) : 0;
      };
      raf = requestAnimationFrame(tick);
    };
    const dom = new MutationObserver(records => {
      if (records.some(r => r.type === 'childList')) sync();
      else follow();
    });
    dom.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('transitionrun', follow, true);
    document.addEventListener('transitionend', follow, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      ro.disconnect();
      io?.disconnect();
      dom.disconnect();
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('transitionrun', follow, true);
      document.removeEventListener('transitionend', follow, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [reposition, target, root]);

  // Read the hint out once, the first time it shows.
  const shown = placed !== null;
  useEffect(() => {
    if (!shown || announced.current) return;
    announced.current = true;
    setAnnouncement(body ? `${title}. ${body}` : title);
  }, [shown, title, body]);

  return createPortal(
    <>
      {placed && (
        <div
          className={styles.ring}
          aria-hidden
          style={{ left: placed.ring.left, top: placed.ring.top, width: placed.ring.width, height: placed.ring.height }}
        />
      )}
      <div
        ref={bubbleRef}
        className={`${styles.bubble} ${placed ? styles[placed.side] : ''}`}
        role="region"
        aria-labelledby={titleId}
        aria-describedby={body ? bodyId : undefined}
        data-hint-id={hintId}
        style={{ left: placed?.left ?? 0, top: placed?.top ?? 0, visibility: placed ? 'visible' : 'hidden' }}
      >
        <span
          className={styles.arrow}
          data-coachmark-arrow
          aria-hidden
          style={placed ? (placed.side === 'top' || placed.side === 'bottom' ? { left: placed.arrow } : { top: placed.arrow }) : undefined}
        />
        <div className={styles.text}>
          <div id={titleId} className={styles.title}>{title}</div>
          {body && <div id={bodyId} className={styles.body}>{body}</div>}
        </div>
        <Button tone="ghost" size="sm" icon={<X />} aria-label={dismissLabel} onClick={onDismiss} />
      </div>
      <span role="status" className={styles.srOnly}>{announcement}</span>
    </>,
    root,
  );
}

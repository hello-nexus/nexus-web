// Blessed composite for `ui-avatar`: a first-party 3D avatar rendered
// host-side (three.js; the sandboxed worker has no WebGL). Mirrors the
// ClockFace/WorldClock composites in richComponents.tsx - the worker places
// this element and supplies only serializable props, every pixel stays host
// side - except the renderer itself is too heavy to load eagerly, so it is
// behind a dynamic import() (see avatarSession.ts) and never reaches the main
// dashboard bundle.
//
// usePanelPreview() is a null-safe context read (defaults false with no
// provider), matching the discipline in
// .agents/rules/context-provider-coverage.md - this component never throws
// when mounted outside the catalog's PanelPreviewProvider.

import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'lucide-react';
import type { HostProps } from './components';
import { usePanelPreview } from '../../panel/widgets/common/PanelPreviewContext';
import { usePanelImmersive } from '../../panel/widgets/common/PanelImmersiveContext';
import { useTranslation } from '../../lib/i18n';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { clampEnergy, inViewFromEntries, parseReactionTrigger, resolveAvatarRenderMode, toBool } from './avatarProps';
import type { AvatarSession } from './avatarSession';

const wrapStyle: CSSProperties = {
  position: 'relative', display: 'flex', flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden',
};
// top/left/right/bottom rather than inset: the Q-series panel is Chromium 83.
const fadeStyle: CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#000', opacity: 0, pointerEvents: 'none',
};
const overlayStyle: CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 8, textAlign: 'center', color: 'var(--text-dim, currentColor)', fontSize: 12,
};
const previewStyle: CSSProperties = {
  display: 'flex', flex: 1, minWidth: 0, minHeight: 0, alignItems: 'center', justifyContent: 'center',
  background: 'var(--surface, rgba(255,255,255,0.06))', borderRadius: 8,
};

/** Caps device pixel ratio the same way the lighting shader preview does (perf). */
function devicePixelRatioCapped(): number {
  const dpr = typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
  return Math.min(Math.max(dpr, 1), 1.5);
}

/**
 * Sessions survive React unmounts: panel-grid drags remount the whole widget
 * subtree, and rebuilding the GL context + pack there would visibly restart
 * the character. The session owns its canvas; a remount reparents the SAME
 * canvas (GL contexts survive DOM moves) and cancels the pending disposal.
 * Keyed by pack URL - concurrent widgets sharing one pack share the session:
 * the immersive overlay mounts a second claimant over the tile and the SAME
 * live character moves fullscreen and back. Level props (dance/energy) are
 * sent by every claimant idempotently; edge props (reaction) would double-fire
 * with two claimants mounted.
 */
interface CachedAvatar {
  canvas: HTMLCanvasElement;
  promise: Promise<AvatarSession>;
  session: AvatarSession | null;
  fade: { cb: ((alpha01: number) => void) | null };
  disposeTimer: ReturnType<typeof setTimeout> | null;
  /**
   * Mounted wrappers referencing this session; the newest holds the canvas.
   * Each records whether it wants pointer gestures, applied whenever it holds.
   */
  claimants: Map<HTMLElement, { interactive: boolean }>;
  /** Latches the one-shot walk-in per SESSION: a later claimant (the
   *  immersive overlay) re-reading `intro` must not replay it. */
  introStarted: boolean;
}
const avatarCache = new Map<string, CachedAvatar>();
const DISPOSE_GRACE_MS = 5000;

// Reparents the canvas into `wrap` and applies that claimant's gesture state
// and box size. Sizing uses client* (layout px): ResizeObserver won't refire
// on a reparent (the wrap's size didn't change), so the renderer must be
// resized here, in the same layout units the observer reports.
function applyClaim(entry: CachedAvatar, wrap: HTMLElement): void {
  wrap.appendChild(entry.canvas);
  entry.canvas.style.pointerEvents = entry.claimants.get(wrap)?.interactive ? 'auto' : 'none';
  if (entry.session && wrap.clientWidth > 0 && wrap.clientHeight > 0) {
    entry.session.resize(wrap.clientWidth, wrap.clientHeight, devicePixelRatioCapped());
  }
}

function acquireAvatar(pack: string, wrap: HTMLElement, interactive: boolean): CachedAvatar {
  const entry = avatarCache.get(pack);
  if (entry) {
    if (entry.disposeTimer !== null) {
      clearTimeout(entry.disposeTimer);
      entry.disposeTimer = null;
    }
    entry.claimants.set(wrap, { interactive });
    applyClaim(entry, wrap);
    return entry;
  }
  const canvas = document.createElement('canvas');
  // pointer-events starts off so a tile never owns a gesture; the holder's
  // claim (applyClaim / the composite's gesture effect) is the only thing
  // that turns it on.
  canvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none';
  const fade: CachedAvatar['fade'] = { cb: null };
  const created: CachedAvatar = { canvas, session: null, fade, disposeTimer: null, claimants: new Map([[wrap, { interactive }]]), introStarted: false, promise: undefined as unknown as Promise<AvatarSession> };
  wrap.appendChild(canvas);
  canvas.style.pointerEvents = interactive ? 'auto' : 'none';
  created.promise = import('./avatarSession').then((m) =>
    m.createAvatarSession(canvas, pack, { onFadeProgress: (a) => fade.cb?.(a) }),
  );
  created.promise.then(
    (session) => {
      created.session = session;
    },
    () => {
      avatarCache.delete(pack);
    },
  );
  avatarCache.set(pack, created);
  return created;
}

function releaseAvatar(pack: string, entry: CachedAvatar, wrap: HTMLElement): void {
  entry.fade.cb = null;
  entry.claimants.delete(wrap);
  const survivor = [...entry.claimants.keys()].pop();
  if (survivor) {
    // A drag ghost, older mount, or the immersive overlay released; hand the
    // canvas (with the survivor's gesture state + size) to whoever is left.
    applyClaim(entry, survivor);
    return;
  }
  entry.disposeTimer = setTimeout(() => {
    avatarCache.delete(pack);
    void entry.promise.then((session) => session.dispose()).catch(() => undefined);
  }, DISPOSE_GRACE_MS);
}

export function AvatarComposite(p: HostProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const immersive = usePanelImmersive();
  const mode = resolveAvatarRenderMode(preview, p.pack);

  const dance = toBool(p.dance);
  const listening = toBool(p.listening);
  const energy = clampEnergy(p.energy);
  // Pointer orbit/zoom runs only inside the immersive overlay; in a tile the
  // canvas stays pointer-events:none so a tap falls through to the panel
  // cell's tap-to-immersive and no drag ever moves the camera.
  const gesturesEnabled = immersive && p.interactive !== false;
  const reaction = typeof p.reaction === 'string' ? p.reaction : undefined;
  const intro = toBool(p.intro);
  const demo = toBool(p.demo);
  const zoom = typeof p.zoom === 'number' && Number.isFinite(p.zoom) ? Math.max(0, Math.min(1, p.zoom)) : null;
  // Latest listeners via ref: __events is a fresh object per synced render.
  const eventsRef = useRef(p.__events);
  eventsRef.current = p.__events;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fadeRef = useRef<HTMLDivElement | null>(null);
  const entryRef = useRef<CachedAvatar | null>(null);
  const [session, setSession] = useState<AvatarSession | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');

  const livePack = mode.kind === 'live' ? mode.pack : null;

  // True while this mount's wrapper holds the shared canvas. Holdership moves
  // outside React (applyClaim on acquire/release), so callers re-check per
  // event rather than per render.
  const holdsCanvas = useCallback(() => {
    const entry = entryRef.current;
    return entry !== null && entry.canvas.parentElement === wrapRef.current;
  }, []);

  // Records this mount's gesture state on its claim (so a canvas handback
  // re-applies it) and applies it live while holding. Declared before the
  // acquire effect so the ref is current when acquireAvatar claims.
  const gesturesRef = useRef(false);
  useEffect(() => {
    gesturesRef.current = gesturesEnabled;
    const entry = entryRef.current;
    const wrap = wrapRef.current;
    if (!entry || !wrap) return;
    const claim = entry.claimants.get(wrap);
    if (claim) claim.interactive = gesturesEnabled;
    if (entry.canvas.parentElement === wrap) {
      entry.canvas.style.pointerEvents = gesturesEnabled ? 'auto' : 'none';
    }
  }, [gesturesEnabled]);

  // Acquires (or re-acquires after a grid-drag remount) the cached session
  // and reparents its canvas into this mount's wrapper. The `cancelled` guard
  // covers unmounts and React StrictMode's dev-only double-invoke.
  useEffect(() => {
    setSession(null);
    if (livePack === null) return;
    setPhase('loading');
    let cancelled = false;

    const wrap = wrapRef.current;
    if (!wrap) return;
    const entry = acquireAvatar(livePack, wrap, gesturesRef.current);
    entryRef.current = entry;
    entry.fade.cb = (alpha) => {
      if (fadeRef.current) fadeRef.current.style.opacity = String(alpha);
    };
    if (entry.session) {
      setSession(entry.session);
      setPhase('ready');
    } else {
      entry.promise.then(
        (s) => {
          if (cancelled) return;
          setSession(s);
          setPhase('ready');
        },
        (err: unknown) => {
          console.error('[avatar] failed to load pack', err);
          if (!cancelled) setPhase('error');
        },
      );
    }

    return () => {
      cancelled = true;
      entryRef.current = null;
      releaseAvatar(livePack, entry, wrap);
    };
  }, [livePack]);

  // Sizes the renderer to the measured box, same ResizeObserver idiom
  // SandboxedWidget uses to size the whole widget tile. Measures once
  // synchronously up front too: ResizeObserver's first notification lands
  // after that frame's requestAnimationFrame callbacks, so without this the
  // raf loop's first tick(s) would render at the renderer's default size.
  // Only the canvas holder sizes: a covered tile resizing under the immersive
  // overlay must not shrink the fullscreen render.
  useEffect(() => {
    if (!session) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (holdsCanvas() && rect.width > 0 && rect.height > 0) {
      session.resize(Math.round(rect.width), Math.round(rect.height), devicePixelRatioCapped());
    }
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r || r.width <= 0 || r.height <= 0) return;
      if (!holdsCanvas()) return;
      session.resize(Math.round(r.width), Math.round(r.height), devicePixelRatioCapped());
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [session, holdsCanvas]);

  // Per-frame update loop, paused whenever the tab is hidden or the element
  // scrolls offscreen (the same two signals src/site/hooks/useInViewport.ts
  // gates a WebGL loop on), so a scrolled-away or backgrounded avatar costs
  // nothing.
  useEffect(() => {
    if (!session) return;
    const el = wrapRef.current;
    let raf = 0;
    let last = performance.now();
    let tabVisible = typeof document === 'undefined' || !document.hidden;
    let inView = true;

    const shouldRun = () => tabVisible && inView;
    // Budget-capped tick (caps 120Hz+ displays). The sub-budget remainder
    // carries into `last` AND dt consumes only the quantized time: a plain
    // `last = now` throttle skips rAF frames that land a hair early and beats
    // down well below the budget, while spending raw `elapsed` against a
    // carried remainder double-counts the carry (intermittent 2x playback).
    const FRAME_MS = 1000 / 60;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      const elapsed = now - last;
      if (elapsed < FRAME_MS) return;
      const carry = elapsed % FRAME_MS;
      const dt = Math.min((elapsed - carry) / 1000, 0.1);
      last = now - carry;
      // Only the canvas holder ticks: a second claimant (the tile behind the
      // immersive overlay) advancing the same session doubles animation speed.
      if (!holdsCanvas()) return;
      session.tick(dt);
    };
    const resume = () => {
      if (!shouldRun() || raf !== 0) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    };
    const pause = () => {
      if (raf === 0) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const onVisibility = () => {
      tabVisible = typeof document === 'undefined' || !document.hidden;
      if (shouldRun()) resume(); else pause();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let io: IntersectionObserver | null = null;
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        inView = inViewFromEntries(entries, inView);
        if (shouldRun()) resume(); else pause();
      }, { threshold: 0.01 });
      io.observe(el);
    }

    resume();

    return () => {
      pause();
      document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
    };
  }, [session, holdsCanvas]);

  useEffect(() => {
    session?.handleSignal({ signal: 'media:playing', n: dance ? 1 : 0 });
  }, [session, dance]);

  useEffect(() => {
    session?.handleSignal({ signal: listening ? 'discord:talking' : 'discord:silent' });
  }, [session, listening]);

  useEffect(() => {
    session?.handleSignal({ signal: 'system:energy', n: energy });
  }, [session, energy]);

  // Holder-gated: with the tile and the immersive overlay both mounted, each
  // receives the same "Trigger#seq" prop; only the canvas holder forwards it,
  // so the shared session's one-shot fires exactly once.
  useEffect(() => {
    const trigger = parseReactionTrigger(reaction);
    if (trigger && holdsCanvas()) session?.triggerReaction(trigger);
  }, [session, reaction, holdsCanvas]);

  useEffect(() => {
    session?.setDemo(demo);
  }, [session, demo]);

  // The worker's zoom prop drives the camera; the camera's own wheel/pinch
  // zoom is reported back after each gesture so a worker control can track
  // it. Any pointer or wheel activity on the stage is reported, throttled,
  // for idle timers. Both only matter where gestures live (immersive).
  // Pointers currently on the canvas; the worker's zoom echoes back a frame
  // late, so writing it during a gesture would fight the fingers.
  const downRef = useRef(0);
  useEffect(() => {
    if (session && zoom !== null && downRef.current === 0 && holdsCanvas()) session.setZoom(zoom);
  }, [session, zoom, holdsCanvas]);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!session || !gesturesEnabled || !wrap) return;
    let lastInteraction = 0;
    const interaction = () => {
      const now = performance.now();
      if (now - lastInteraction < 250) return;
      lastInteraction = now;
      eventsRef.current?.interaction?.();
    };
    let lastSent = -1;
    const reportZoom = () => {
      const z = session.getZoom();
      if (Math.abs(z - lastSent) < 0.002) return;
      lastSent = z;
      eventsRef.current?.zoom?.(z);
    };
    // A pinch reports while it runs, so a host control tracks the camera
    // instead of jumping when the fingers lift. Ids, not a counter: a pointer
    // whose up never reaches this element (capture stolen, target removed)
    // would otherwise pump forever.
    const live = new Set<number>();
    let frame = 0;
    const pump = () => {
      frame = 0;
      reportZoom();
      if (live.size > 0) frame = requestAnimationFrame(pump);
    };
    const onDown = (e: PointerEvent) => {
      live.add(e.pointerId);
      downRef.current = live.size;
      interaction();
      if (!frame) frame = requestAnimationFrame(pump);
    };
    const onUp = (e: PointerEvent) => {
      live.delete(e.pointerId);
      downRef.current = live.size;
      reportZoom();
    };
    const onWheel = () => { interaction(); reportZoom(); };
    // The starting depth, so a control reads the camera before any gesture.
    reportZoom();
    wrap.addEventListener('pointerdown', onDown, true);
    wrap.addEventListener('pointerup', onUp, true);
    wrap.addEventListener('pointercancel', onUp, true);
    wrap.addEventListener('lostpointercapture', onUp, true);
    // Bubble phase: the camera applies the notch in the canvas's own wheel
    // handler, so a capture listener would report the value before it.
    wrap.addEventListener('wheel', onWheel);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      live.clear();
      downRef.current = 0;
      wrap.removeEventListener('pointerdown', onDown, true);
      wrap.removeEventListener('pointerup', onUp, true);
      wrap.removeEventListener('pointercancel', onUp, true);
      wrap.removeEventListener('lostpointercapture', onUp, true);
      wrap.removeEventListener('wheel', onWheel);
    };
  }, [session, gesturesEnabled]);

  // One-shot per session, deliberately not reactive to later `intro` toggles
  // ("play walk-in once on mount" per the pinned contract) - reads the
  // current `intro` value only at the moment a session becomes ready. The
  // entry latch keeps a second claimant (the immersive overlay re-mounting
  // over a live tile) from replaying the walk-in.
  useEffect(() => {
    const entry = entryRef.current;
    if (session && intro && entry && !entry.introStarted) {
      entry.introStarted = true;
      session.startIntro();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (mode.kind === 'empty') return null;

  if (mode.kind === 'preview') {
    return (
      <div style={previewStyle}>
        <User size={28} color="var(--text-dim, currentColor)" aria-hidden="true" />
      </div>
    );
  }

  return (
    // With gestures on (immersive), camera drags on the canvas must not arm
    // the overlay's swipe-down dismiss; exit stays on the grabber pill / ESC.
    <div ref={wrapRef} style={wrapStyle} data-panel-no-sheet-swipe={gesturesEnabled ? 'true' : undefined}>
      <div ref={fadeRef} style={fadeStyle} aria-hidden="true" />
      {phase === 'loading' && (
        <div style={overlayStyle}><Spinner size={24} /></div>
      )}
      {phase === 'error' && (
        <div style={overlayStyle}>{t('sdk.avatar.loadError')}</div>
      )}
    </div>
  );
}

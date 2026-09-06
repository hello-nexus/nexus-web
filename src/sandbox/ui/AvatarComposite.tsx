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

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'lucide-react';
import type { HostProps } from './components';
import { usePanelPreview } from '../../panel/widgets/common/PanelPreviewContext';
import { usePanelImmersive } from '../../panel/widgets/common/PanelImmersiveContext';
import { useImmersiveExit } from '../../panel/overlays/immersiveExit';
import { useTranslation } from '../../lib/i18n';
import { Spinner } from '../../components/common/Spinner/Spinner';
import { clampEnergy, parseReactionTrigger, resolveAvatarRenderMode, toBool } from './avatarProps';
import {
  STICKER_MAX_COUNT, newPlacement, parsePlacements, parseStickers, parseStream, type StickerPlacement,
} from './avatarStickers';
import { AvatarStickerLayer } from './AvatarStickerLayer';
import { AvatarImmersiveDrawer, type LivePopup } from './AvatarImmersiveDrawer';
import { isStickerSrcAllowed } from './avatarStickers';
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
/** Idle time on the stage before the controls drawer folds to its lip. */
export const DRAWER_IDLE_MS = 30_000;
/** How long the "not live" card stays up after a Live press with no stream. */
const IDLE_CARD_MS = 4000;

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
  // Immersive-only extras. Parsed every render (cheap) because remote-dom
  // hands over fresh objects whenever the worker re-renders.
  const status = typeof p.status === 'string' ? p.status.trim() : '';
  const statusLive = toBool(p.statusLive);
  const stream = useMemo(() => parseStream(p.stream), [p.stream]);
  const stickers = useMemo(() => parseStickers(p.stickers), [p.stickers]);
  const placementsProp = useMemo(() => parsePlacements(p.placements, stickers), [p.placements, stickers]);
  const offlineArt = typeof p.offlineArt === 'string' && isStickerSrcAllowed(p.offlineArt) ? p.offlineArt : null;
  const exitImmersive = useImmersiveExit();

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fadeRef = useRef<HTMLDivElement | null>(null);
  const entryRef = useRef<CachedAvatar | null>(null);
  const [session, setSession] = useState<AvatarSession | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');

  const livePack = mode.kind === 'live' ? mode.pack : null;

  // Tells the worker when this mount takes / leaves the fullscreen stage. The
  // immersive overlay runs its own worker, so its composite fires true on
  // mount and false on unmount; a tile's composite never fires (false is the
  // worker's starting assumption). Latest listener via ref: __events is a
  // fresh object per synced render.
  const eventsRef = useRef(p.__events);
  eventsRef.current = p.__events;
  useEffect(() => {
    if (!immersive || mode.kind !== 'live') return;
    eventsRef.current?.immersive?.(true);
    return () => { eventsRef.current?.immersive?.(false); };
  }, [immersive, mode.kind]);

  // Sticker placements: the worker owns the persisted set, this mount owns
  // the in-session copy so an edit shows at once and survives the round trip
  // (emit -> worker local state -> prop) without a snap-back frame. A prop
  // whose VALUE changes replaces the copy; a mere identity change does not.
  const [placements, setPlacements] = useState<StickerPlacement[]>(placementsProp);
  const placementsKey = JSON.stringify(placementsProp);
  const lastKeyRef = useRef(placementsKey);
  useEffect(() => {
    if (lastKeyRef.current === placementsKey) return;
    lastKeyRef.current = placementsKey;
    setPlacements(placementsProp);
  }, [placementsKey, placementsProp]);
  const [stickerEditing, setStickerEditing] = useState(false);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const commitPlacements = useCallback((next: StickerPlacement[]) => {
    setPlacements(next);
    lastKeyRef.current = JSON.stringify(next);
    eventsRef.current?.placements?.(next);
  }, []);
  const addSticker = useCallback((stickerId: string) => {
    if (placements.length >= STICKER_MAX_COUNT) return;
    const added = newPlacement(stickerId);
    setSelectedSticker(added.id);
    commitPlacements([...placements, added]);
  }, [placements, commitPlacements]);
  const toggleStickerEditing = useCallback(() => {
    setSelectedSticker(null);
    setStickerEditing((v) => !v);
  }, []);
  useEffect(() => {
    if (!immersive) setStickerEditing(false);
  }, [immersive]);

  // Controls drawer: open on every entry (this composite mounts per entry),
  // folds to its lip after DRAWER_IDLE_MS without a touch on the stage, and
  // stays put while stickers are being edited or the stream is playing (a
  // fold takes the player with it, and watching hands-off is the point of
  // Live). Any pointer or wheel activity anywhere on the stage restarts the
  // idle clock.
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [livePopup, setLivePopup] = useState<LivePopup>('none');
  const idleCardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearIdleCard = useCallback(() => {
    if (idleCardTimer.current) clearTimeout(idleCardTimer.current);
    idleCardTimer.current = null;
  }, []);
  // Folding the drawer is the stream's off switch too (nothing plays unseen).
  const closeDrawer = useCallback(() => { setDrawerOpen(false); setLivePopup('none'); clearIdleCard(); }, [clearIdleCard]);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playerUp = livePopup === 'player';
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!immersive || !drawerOpen || stickerEditing || playerUp || !wrap) return;
    const arm = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(closeDrawer, DRAWER_IDLE_MS);
    };
    arm();
    wrap.addEventListener('pointerdown', arm, true);
    wrap.addEventListener('wheel', arm, true);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = null;
      wrap.removeEventListener('pointerdown', arm, true);
      wrap.removeEventListener('wheel', arm, true);
    };
  }, [immersive, drawerOpen, stickerEditing, playerUp, closeDrawer]);

  // Live button: the stream pops when one is on; otherwise a short "not live"
  // card over the app's art, and the worker is asked to re-check at once. A
  // stream arriving while the card is up swaps it for the player.
  const onLivePress = useCallback(() => {
    if (stream) {
      clearIdleCard();
      setLivePopup((v) => (v === 'player' ? 'none' : 'player'));
      return;
    }
    eventsRef.current?.livecheck?.();
    setLivePopup('idle');
    clearIdleCard();
    idleCardTimer.current = setTimeout(() => { idleCardTimer.current = null; setLivePopup('none'); }, IDLE_CARD_MS);
  }, [stream, clearIdleCard]);
  useEffect(() => {
    if (stream && livePopup === 'idle') { clearIdleCard(); setLivePopup('player'); }
    if (!stream && livePopup === 'player') setLivePopup('none');
  }, [stream, livePopup, clearIdleCard]);
  useEffect(() => () => clearIdleCard(), [clearIdleCard]);

  // Camera zoom slider, in the session's 0..1 depth. Seeded from the camera
  // once the session is up, and re-read after every canvas gesture (wheel,
  // pinch, drag) so the thumb tracks zoom the camera changed on its own.
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    if (!session || !immersive) return;
    const sync = () => setZoom(Math.round(session.getZoom() * 100));
    sync();
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.addEventListener('pointerup', sync, true);
    wrap.addEventListener('wheel', sync, true);
    return () => {
      wrap.removeEventListener('pointerup', sync, true);
      wrap.removeEventListener('wheel', sync, true);
    };
  }, [session, immersive]);
  const onZoom = useCallback((v: number) => {
    setZoom(v);
    session?.setZoom(v / 100);
  }, [session]);

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
        inView = entries[0]?.isIntersecting ?? true;
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

  const showExtras = immersive && phase === 'ready';
  // The drawer always shows on stage: it carries the exit and zoom controls
  // even for an app that passes no stream, art, or stickers.
  const showDock = showExtras;

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
      {showExtras && stickers.length > 0 && (
        <AvatarStickerLayer
          stickers={stickers}
          placements={placements}
          editing={stickerEditing}
          selectedId={selectedSticker}
          onSelect={setSelectedSticker}
          onChange={commitPlacements}
        />
      )}
      {showDock && (
        <AvatarImmersiveDrawer
          open={drawerOpen}
          onOpen={openDrawer}
          onClose={closeDrawer}
          onExit={exitImmersive}
          status={status}
          statusLive={statusLive}
          stream={stream}
          offlineArt={offlineArt}
          livePopup={livePopup}
          onLivePress={onLivePress}
          stickers={stickers}
          editing={stickerEditing}
          onToggleEditing={toggleStickerEditing}
          onAddSticker={addSticker}
          zoom={zoom}
          onZoom={onZoom}
        />
      )}
    </div>
  );
}

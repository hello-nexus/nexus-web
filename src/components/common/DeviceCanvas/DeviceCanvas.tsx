import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Settings, Eye, Maximize2, Minimize2, RotateCw, RotateCcw } from 'lucide-react';
import type { LightingDevice, LedMapEntry } from '../../../api/lighting';
import { saveDeviceLayout, identifyLightingDevice } from '../../../api/lighting';
import type { AudioSnapshot } from '../../../hooks/useAudioState';
import { useShaderRenderer } from '../../../hooks/useShaderRenderer';
import { useTranslation } from '../../../lib/i18n';
import { isMultiSelectModifier } from '../../../lib/platform';
import { paintLedFrame } from '../../../lib/ledFrame';
import type { EffectState } from '../../../types/lighting';
import { CanvasNoticeBar } from '../CanvasNoticeBar';
import { DeviceContextMenu, type DeviceMenuItem } from './DeviceContextMenu';
import styles from './DeviceCanvas.module.scss';

interface DeviceCanvasProps {
  devices: LightingDevice[];
  canvasPixels: Uint8Array | null;
  canvasW: number;
  canvasH: number;
  /** Ids of all currently selected device frames. Single tap = 1-element set,
   *  marquee = N-element set, Cmd/Ctrl+click = toggle membership. Selected
   *  frames render with the accent border and can be group-dragged together. */
  selectedIds: Set<string>;
  /** The single "primary" device whose LED dots render on top of its frame.
   *  Mirrors the device whose settings the side panel can focus on. Null when
   *  selection is empty; usually equal to the one selected id when N=1, or
   *  the most recently-added / topmost id when N>1. */
  primaryDeviceId: string | null;
  /** Single-replace selection (DevicePanel click, canvas single-tap on a frame
   *  not in the current selection). Sets primary to the id (or null to clear). */
  onSelectDevice: (id: string | null) => void;
  /** Bulk selection replace (canvas marquee release, Cmd/Ctrl+click toggle).
   *  Caller owns the new set membership + which id should become primary. */
  onSetSelection: (ids: Set<string>, primary: string | null) => void;
  shaderEffect?: string | null;
  shaderState?: EffectState | null;
  audioRef?: React.RefObject<AudioSnapshot | null>;
  /** Device ids whose rectangle outline should be hidden on the canvas. View-only flag -
   *  the device still samples its rect for lighting; only the visual overlay is skipped. */
  hiddenFrameIds?: Set<string>;
  /** Active (non-disabled) LEDs for the primary device, used to show position dots on the frame. */
  selectedDeviceLeds?: LedMapEntry[] | null;
  /** Called when the user clicks the settings button on a device frame. */
  onOpenSettings?: (id: string) => void;
  /** Notifies parent when a drag starts or ends, so it can pause state updates. */
  onDragActiveChange?: (active: boolean) => void;
  /** Called before a layout-changing edit (first drag movement, rotate, maximize)
   *  so callers can snapshot for undo. Not fired for a tap that never moves. */
  onBeforeLayoutSave?: () => void;
  /** Called after a drag/rotate/maximize layout save completes, so callers can auto-save to the active preset. */
  onLayoutCommit?: () => void;
  gpuAvailable?: boolean;
}

const CW = 1000;
const CH = 600;
const PAD = 0;

type DragMode = 'move' | 'resize-br';

const CanvasBackground = memo(function CanvasBackground({ canvasPixels, canvasW, canvasH }: {
  canvasPixels: Uint8Array | null; canvasW: number; canvasH: number;
}) {
  const bgRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = bgRef.current;
    if (!el) return;
    paintLedFrame(el, canvasPixels, canvasW, canvasH);
  }, [canvasPixels, canvasW, canvasH]);

  return <canvas ref={bgRef} className={styles.bgCanvas} />;
});

const DeviceOverlays = memo(function DeviceOverlays({ devices, selectedIds, primaryDeviceId, onSelectDevice, onSetSelection, containerRef, selectedDeviceLeds, onOpenSettings, onDragActiveChange, onBeforeLayoutSave, onLayoutCommit }: {
  devices: LightingDevice[];
  selectedIds: Set<string>;
  primaryDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  onSetSelection: (ids: Set<string>, primary: string | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedDeviceLeds?: LedMapEntry[] | null;
  onOpenSettings?: (id: string) => void;
  onDragActiveChange?: (active: boolean) => void;
  onBeforeLayoutSave?: () => void;
  onLayoutCommit?: () => void;
}) {
  const { t } = useTranslation();
  const onBeforeLayoutSaveRef = useRef(onBeforeLayoutSave);
  onBeforeLayoutSaveRef.current = onBeforeLayoutSave;
  const onLayoutCommitRef = useRef(onLayoutCommit);
  onLayoutCommitRef.current = onLayoutCommit;
  // Single-frame drag carries one orig rect; group drag carries the orig
  // rects of every selected device so handlePointerMove can apply the same
  // (clamped) delta to all of them while keeping the dragged frame as the
  // pointer anchor.
  const [drag, setDrag] = useState<{
    id: string; mode: DragMode;
    startX: number; startY: number;
    origX: number; origY: number; origW: number; origH: number;
    /** Set iff this is a group drag. Maps id -> orig top-left rect. The dragged
     *  frame is included so the iteration is uniform. */
    groupOrigs?: Map<string, { x: number; y: number; w: number; h: number }>;
  } | null>(null);
  // Marquee state. preIds + additive let a Cmd/Ctrl-drag merge with the previous
  // selection so the user can refine a multi-select instead of starting over.
  // `hits` is the live overlap set, recomputed on each pointer-move so frames
  // light up the instant the rect crosses them - the parent's selectedIds
  // doesn't update until pointer-up, so this live preview stays local to the
  // canvas and never re-renders LightingPage.
  const [marquee, setMarquee] = useState<{
    startX: number; startY: number;
    curX: number; curY: number;
    additive: boolean;
    preIds: Set<string>;
    hits: Set<string>;
    moved: boolean;
  } | null>(null);
  const [, forceRender] = useState(0);
  // Right-click context menu anchored at the click point. Opening it never
  // changes the selection - a right-click is not a left-click.
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const containerSizeRef = useRef({ w: 675, h: 380 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      containerSizeRef.current = { w: e.contentRect.width, h: e.contentRect.height };
      forceRender(n => n + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  const primaryDeviceIdRef = useRef(primaryDeviceId);
  // Latest-ref pattern: startDrag needs the current primary at pointer-down
  // time to seed tapRef. Writing in an effect would lag by one paint and
  // break the cycle-through-stack tap behaviour.

  primaryDeviceIdRef.current = primaryDeviceId;
  // Captures primary at pointer-down so pointer-up can cycle through the stack
  // relative to what was selected before the tap, not after startDrag overwrites it.
  const tapRef = useRef<{ prevPrimary: string | null; moved: boolean } | null>(null);

  // Latest-ref so the document-level Escape handler sees the current set
  // without re-binding the listener on every selection change.
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const ae = document.activeElement;
      // Don't steal Escape from a focused input/textarea (modal dismiss, etc.).
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae as HTMLElement).isContentEditable)) return;
      if (selectedIdsRef.current.size === 0) return;
      e.preventDefault();
      onSetSelection(new Set(), null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onSetSelection]);

  const toCanvas = useCallback((cx: number, cy: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: ((cx - r.left) / r.width) * CW, y: ((cy - r.top) / r.height) * CH };
  }, [containerRef]);

  const startDrag = useCallback((e: React.PointerEvent, dev: LightingDevice, mode: DragMode) => {
    if (e.button !== 0) return; // right/middle click never starts a drag
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    tapRef.current = { prevPrimary: primaryDeviceIdRef.current, moved: false };
    onDragActiveChange?.(true);
    const p = toCanvas(e.clientX, e.clientY);
    // Group drag triggers when the user grabs a frame that's already part of a
    // multi-selection (size >= 2). Otherwise we collapse the selection to just
    // the grabbed frame (matches "click an unselected thing → select only it").
    const isGroup = mode === 'move' && selectedIds.has(dev.id) && selectedIds.size >= 2;
    if (!isGroup) {
      onSelectDevice(dev.id);
    }
    const groupOrigs = isGroup
      ? new Map<string, { x: number; y: number; w: number; h: number }>(
          devices.filter(d => selectedIds.has(d.id))
            .map(d => [d.id, { x: d.canvasX, y: d.canvasY, w: d.canvasW, h: d.canvasH }])
        )
      : undefined;
    setDrag({ id: dev.id, mode, startX: p.x, startY: p.y, origX: dev.canvasX, origY: dev.canvasY, origW: dev.canvasW, origH: dev.canvasH, groupOrigs });
  }, [toCanvas, onSelectDevice, onDragActiveChange, selectedIds, devices]);

  // Cmd/Ctrl+click on a frame: toggle membership without starting a drag. Plain
  // click on a frame still falls through to startDrag.
  const handleFramePointerDown = useCallback((e: React.PointerEvent, dev: LightingDevice) => {
    if (e.button !== 0) return; // right-click is handled by onContextMenu, not selection
    if (isMultiSelectModifier(e)) {
      e.preventDefault(); e.stopPropagation();
      const next = new Set(selectedIds);
      if (next.has(dev.id)) {
        next.delete(dev.id);
        // Removed primary: pick any remaining id as the new primary, prefer
        // the topmost (last in devices array) so LED dots track to a visible
        // frame. Empty set → primary null.
        let nextPrimary = primaryDeviceId;
        if (dev.id === primaryDeviceId) {
          nextPrimary = null;
          for (let i = devices.length - 1; i >= 0; i--) {
            if (next.has(devices[i].id)) { nextPrimary = devices[i].id; break; }
          }
        }
        onSetSelection(next, nextPrimary);
      } else {
        next.add(dev.id);
        // Newly-toggled-in id becomes primary so the side panel + LED dots
        // follow the user's latest interaction.
        onSetSelection(next, dev.id);
      }
      return;
    }
    startDrag(e, dev, 'move');
  }, [selectedIds, primaryDeviceId, devices, onSetSelection, startDrag]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (marquee) {
      const p = toCanvas(e.clientX, e.clientY);
      const moved = marquee.moved || Math.abs(p.x - marquee.startX) > 4 || Math.abs(p.y - marquee.startY) > 4;
      // O(N) AABB hit-test, ~20 devices, runs at pointer-move rate (~60Hz).
      // ~1200 cheap bbox checks/s - well under the "noticeable" CPU bar.
      const x1 = Math.min(marquee.startX, p.x);
      const y1 = Math.min(marquee.startY, p.y);
      const x2 = Math.max(marquee.startX, p.x);
      const y2 = Math.max(marquee.startY, p.y);
      const hits = new Set<string>();
      for (const dev of devices) {
        if (!(dev.canvasX + dev.canvasW < x1 || dev.canvasX > x2 || dev.canvasY + dev.canvasH < y1 || dev.canvasY > y2)) {
          hits.add(dev.id);
        }
      }
      setMarquee({ ...marquee, curX: p.x, curY: p.y, moved, hits });
      // Push live preview to parent so the right-side device panel
      // highlights in lockstep. Primary stays pinned to whatever it was
      // pre-drag so LED dots don't flicker and the LED-map fetch effect
      // (deps include primaryDeviceId but not selectedDeviceIds) stays
      // quiet during the drag.
      const effective = marquee.additive ? new Set([...marquee.preIds, ...hits]) : hits;
      onSetSelection(effective, primaryDeviceIdRef.current);
      return;
    }
    if (!drag) return;
    const p = toCanvas(e.clientX, e.clientY);
    const dx = p.x - drag.startX, dy = p.y - drag.startY;
    if (tapRef.current && !tapRef.current.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      tapRef.current.moved = true;
      // First movement past the tap threshold: snapshot the layout for undo,
      // once per drag, before any position change. The device is still at its
      // exact pre-drag spot here (sub-threshold moves are skipped below), and a
      // tap that never crosses pushes nothing.
      onBeforeLayoutSaveRef.current?.();
    }
    // Hold position until the drag crosses the threshold: a sub-threshold wiggle
    // stays a tap and the undo snapshot above stays exact.
    if (tapRef.current && !tapRef.current.moved) return;
    if (drag.mode === 'move' && drag.groupOrigs) {
      // Group move: clamp the GROUP's delta so the most-constrained device
      // hits the wall first and the others stay locked together. Per-device
      // clamping would smear the group apart on edge contact.
      // Defensive: if the orig map was somehow emptied (e.g. selection went
      // stale between startDrag and the next concurrent render), bail rather
      // than letting ±Infinity bounds pass dx/dy through unclamped.
      if (drag.groupOrigs.size === 0) { setDrag(null); return; }
      let dxMin = -Infinity, dxMax = Infinity, dyMin = -Infinity, dyMax = Infinity;
      for (const sd of devices) {
        const orig = drag.groupOrigs.get(sd.id);
        if (!orig) continue;
        dxMin = Math.max(dxMin, PAD - orig.x);
        dxMax = Math.min(dxMax, CW - PAD - orig.w - orig.x);
        dyMin = Math.max(dyMin, PAD - orig.y);
        dyMax = Math.min(dyMax, CH - PAD - orig.h - orig.y);
      }
      const cdx = Math.max(dxMin, Math.min(dxMax, dx));
      const cdy = Math.max(dyMin, Math.min(dyMax, dy));
      for (const sd of devices) {
        const orig = drag.groupOrigs.get(sd.id);
        if (!orig) continue;
        sd.canvasX = orig.x + cdx;
        sd.canvasY = orig.y + cdy;
      }
      forceRender(n => n + 1);
      return;
    }
    const dev = devices.find(d => d.id === drag.id);
    if (!dev) return;
    if (drag.mode === 'move') {
      dev.canvasX = Math.max(PAD, Math.min(CW - PAD - dev.canvasW, drag.origX + dx));
      dev.canvasY = Math.max(PAD, Math.min(CH - PAD - dev.canvasH, drag.origY + dy));
    } else {
      dev.canvasW = Math.max(60, Math.min(CW - PAD - dev.canvasX, drag.origW + dx));
      dev.canvasH = Math.max(60, Math.min(CH - PAD - dev.canvasY, drag.origH + dy));
    }
    forceRender(n => n + 1);
  }, [drag, marquee, devices, toCanvas, onSetSelection]);

  const handlePointerUp = useCallback(async () => {
    if (marquee) {
      // Click on empty space (no drag) clears the selection - preserves the
      // pre-marquee behaviour of "tap canvas to deselect". A Cmd/Ctrl+click never
      // clears (it would surprise users mid-additive-selection).
      if (!marquee.moved) {
        if (!marquee.additive) onSelectDevice(null);
        setMarquee(null);
        return;
      }
      // Reuse the live preview set from the last pointer-move. Merge with
      // preIds when additive so prior selections stay alongside new hits.
      const hits = marquee.additive ? new Set([...marquee.preIds, ...marquee.hits]) : marquee.hits;
      // Primary = topmost (last in devices array) hit so LED dots land on a
      // visible frame. Empty hit set → null primary.
      let primary: string | null = null;
      for (let i = devices.length - 1; i >= 0; i--) {
        if (hits.has(devices[i].id)) { primary = devices[i].id; break; }
      }
      onSetSelection(hits, primary);
      setMarquee(null);
      return;
    }
    if (!drag) return;
    const tap = tapRef.current;
    tapRef.current = null;
    if (drag.mode === 'move' && drag.groupOrigs) {
      // Save every moved device in parallel - saveDeviceLayout is an independent POST per id.
      await Promise.all(devices.filter(d => drag.groupOrigs!.has(d.id)).map(sd =>
        saveDeviceLayout(sd.id, sd.canvasX, sd.canvasY, sd.canvasW, sd.canvasH, sd.canvasRotation ?? 0),
      ));
      if (tap?.moved) onLayoutCommitRef.current?.();
    } else {
      const dev = devices.find(d => d.id === drag.id);
      if (dev) {
        await saveDeviceLayout(dev.id, dev.canvasX, dev.canvasY, dev.canvasW, dev.canvasH, dev.canvasRotation ?? 0);
        if (tap?.moved) onLayoutCommitRef.current?.();
      }
    }
    onDragActiveChange?.(false);
    setDrag(null);
    // Tap-cycle (no drag, no group): step through the stack at the click point.
    if (!tap || tap.moved || drag.groupOrigs) return;
    const stack = [...devices].reverse().filter(d =>
      drag.startX >= d.canvasX && drag.startX <= d.canvasX + d.canvasW &&
      drag.startY >= d.canvasY && drag.startY <= d.canvasY + d.canvasH
    );
    const idx = stack.findIndex(d => d.id === tap.prevPrimary);
    if (idx === -1) return; // fresh selection: topmost already selected via startDrag
    if (idx === stack.length - 1) { onSelectDevice(null); return; } // bottom of stack: deselect
    onSelectDevice(stack[idx + 1].id); // step one level deeper
  }, [drag, marquee, devices, onSelectDevice, onSetSelection, onDragActiveChange]);

  // Mutates dev's rect in place by one 90° step; no save/render side effects so
  // group rotation can apply it to every target before a single batched save.
  const rotateDevice = useCallback((dev: LightingDevice, dir: 1 | -1) => {
    dev.canvasRotation = ((((dev.canvasRotation ?? 0) + dir * 90) % 360) + 360) % 360;

    // Rotate the whole box footprint, not just the label: each 90° step swaps
    // width and height about the frame's center (two steps = 180° swaps back to
    // the original footprint, which is correct). The LED dots remap off
    // canvasRotation below, so they follow the reoriented box.
    const cx = dev.canvasX + dev.canvasW / 2;
    const cy = dev.canvasY + dev.canvasH / 2;
    let w = dev.canvasH;
    let h = dev.canvasW;
    // If the reoriented box no longer fits the padded canvas, scale it down
    // uniformly so it does (preserves the rotated footprint's aspect ratio).
    const fit = Math.min(1, (CW - 2 * PAD) / w, (CH - 2 * PAD) / h);
    w *= fit;
    h *= fit;
    dev.canvasW = w;
    dev.canvasH = h;
    // Keep the same center, then clamp fully inside the padded canvas.
    dev.canvasX = Math.max(PAD, Math.min(CW - PAD - w, cx - w / 2));
    dev.canvasY = Math.max(PAD, Math.min(CH - PAD - h, cy - h / 2));
  }, []);

  const handleRotate = useCallback((dev: LightingDevice, dir: 1 | -1) => {
    onBeforeLayoutSaveRef.current?.();
    rotateDevice(dev, dir);
    forceRender(n => n + 1);
    void saveDeviceLayout(dev.id, dev.canvasX, dev.canvasY, dev.canvasW, dev.canvasH, dev.canvasRotation).then(() => onLayoutCommitRef.current?.());
  }, [rotateDevice]);

  const handleRotateGroup = useCallback((targets: LightingDevice[], dir: 1 | -1) => {
    onBeforeLayoutSaveRef.current?.();
    targets.forEach(d => rotateDevice(d, dir));
    forceRender(n => n + 1);
    void Promise.all(targets.map(d => saveDeviceLayout(d.id, d.canvasX, d.canvasY, d.canvasW, d.canvasH, d.canvasRotation))).then(() => onLayoutCommitRef.current?.());
  }, [rotateDevice]);

  // A frame counts as "maximized" when it fills the padded canvas. Geometric
  // (not a stored flag) so a manual resize/move drops it out of the maximized
  // state and the menu offers Maximize again instead of Minimize.
  const isMaximized = useCallback((dev: LightingDevice) =>
    dev.canvasX <= PAD + 0.5 && dev.canvasY <= PAD + 0.5
    && dev.canvasX + dev.canvasW >= CW - PAD - 0.5
    && dev.canvasY + dev.canvasH >= CH - PAD - 0.5, []);

  // Mutates dev's rect to the full-canvas or the small centered box; no save/
  // render side effects so group maximize can set every target one direction.
  const setMaximized = useCallback((dev: LightingDevice, maximize: boolean) => {
    if (maximize) {
      dev.canvasX = PAD;
      dev.canvasY = PAD;
      dev.canvasW = CW - 2 * PAD;
      dev.canvasH = CH - 2 * PAD;
    } else {
      dev.canvasX = CW / 2 - 60;
      dev.canvasY = CH / 2 - 15;
      dev.canvasW = 120;
      dev.canvasH = 30;
    }
  }, []);

  const handleMaximize = useCallback((dev: LightingDevice) => {
    onBeforeLayoutSaveRef.current?.();
    setMaximized(dev, !isMaximized(dev));
    forceRender(n => n + 1);
    void saveDeviceLayout(dev.id, dev.canvasX, dev.canvasY, dev.canvasW, dev.canvasH, dev.canvasRotation ?? 0).then(() => onLayoutCommitRef.current?.());
  }, [isMaximized, setMaximized]);

  const handleMaximizeGroup = useCallback((targets: LightingDevice[], maximize: boolean) => {
    onBeforeLayoutSaveRef.current?.();
    targets.forEach(d => setMaximized(d, maximize));
    forceRender(n => n + 1);
    void Promise.all(targets.map(d => saveDeviceLayout(d.id, d.canvasX, d.canvasY, d.canvasW, d.canvasH, d.canvasRotation ?? 0))).then(() => onLayoutCommitRef.current?.());
  }, [setMaximized]);

  const handleFrameContextMenu = useCallback((e: React.MouseEvent, dev: LightingDevice) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ id: dev.id, x: e.clientX, y: e.clientY });
  }, []);

  const handleOverlayPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return; // device frames handle their own pointer-down
    if (e.button !== 0) return; // right-click must not start a marquee or clear selection
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onDragActiveChange?.(true);
    const p = toCanvas(e.clientX, e.clientY);
    setMarquee({
      startX: p.x, startY: p.y, curX: p.x, curY: p.y,
      additive: isMultiSelectModifier(e),
      preIds: new Set(selectedIds),
      hits: new Set(),
      moved: false,
    });
    // Non-additive marquee should clear the prior selection immediately so
    // both the canvas and the right-side panel reflect the "starting fresh"
    // state on the very first frame. Additive (Cmd/Ctrl) keeps the prior set
    // visible - the user is refining, not replacing.
    if (!isMultiSelectModifier(e) && selectedIds.size > 0) {
      onSetSelection(new Set(), null);
    }
  }, [toCanvas, selectedIds, onDragActiveChange, onSetSelection]);

  // Pointer-up off the overlay layer also needs to clean up drag state.
  // Wrap handlePointerUp so the marquee branch resets the drag-active flag
  // (so parents resume polling) and the keyboard-listener selection mirror
  // stays consistent.
  const handlePointerUpWithMarquee = useCallback(async () => {
    if (marquee) onDragActiveChange?.(false);
    await handlePointerUp();
  }, [marquee, handlePointerUp, onDragActiveChange]);

  // Marquee rect in % units so it scales with the container without a
  // separate transform. Math.min/max so the rect renders regardless of
  // which corner the user dragged from.
  const marqueeRect = marquee ? {
    left: `${(Math.min(marquee.startX, marquee.curX) / CW) * 100}%`,
    top: `${(Math.min(marquee.startY, marquee.curY) / CH) * 100}%`,
    width: `${(Math.abs(marquee.curX - marquee.startX) / CW) * 100}%`,
    height: `${(Math.abs(marquee.curY - marquee.startY) / CH) * 100}%`,
  } : null;

  return (
    <div className={styles.overlayLayer}
      onPointerMove={handlePointerMove} onPointerUp={handlePointerUpWithMarquee}
      onPointerDown={handleOverlayPointerDown}
      onContextMenu={e => e.preventDefault()}>
      {devices.map(dev => {
        // selectedIds is kept in sync with the live marquee preview by
        // handlePointerMove, so no marquee-specific branch is needed here.
        const selected = selectedIds.has(dev.id);
        const isPrimary = dev.id === primaryDeviceId;
        const rot = ((dev.canvasRotation ?? 0) % 360 + 360) % 360;
        const { w, h } = containerSizeRef.current;
        const bgX = -(dev.canvasX / CW) * w;
        const bgY = -(dev.canvasY / CH) * h;
        return (
          <div key={dev.id}
            className={`${styles.device} ${drag?.id === dev.id ? styles.dragging : ''} ${selected ? styles.selected : ''}`}
            style={{
              left: `${(dev.canvasX / CW) * 100}%`, top: `${(dev.canvasY / CH) * 100}%`,
              width: `${(dev.canvasW / CW) * 100}%`, height: `${(dev.canvasH / CH) * 100}%`,
              backgroundPosition: `${bgX}px ${bgY}px`,
            }}
            onPointerDown={e => handleFramePointerDown(e, dev)}
            onContextMenu={e => handleFrameContextMenu(e, dev)}>
            <span className={styles.deviceLabel} style={{ transform: `rotate(${rot}deg)` }}>{dev.name}</span>
            <div className={styles.resizeHandle} onPointerDown={e => startDrag(e, dev, 'resize-br')} />
            {isPrimary && selectedDeviceLeds && selectedDeviceLeds
              .filter(l => !l.disabled)
              .map(led => {
                let ur = led.u, vr = led.v;
                if (rot === 90)       { ur = 1 - led.v; vr = led.u; }
                else if (rot === 180) { ur = 1 - led.u; vr = 1 - led.v; }
                else if (rot === 270) { ur = led.v; vr = 1 - led.u; }
                return (
                  <div key={led.index} className={styles.ledDot} style={{ left: `${ur * 100}%`, top: `${vr * 100}%` }} />
                );
              })
            }
          </div>
        );
      })}
      {marqueeRect && <div className={styles.marquee} style={marqueeRect} />}
      {ctxMenu && (() => {
        const dev = devices.find(d => d.id === ctxMenu.id);
        if (!dev) return null;
        // Group mode: a right-click on a frame that is part of a multi-selection
        // acts on every selected frame. `devices` is already the visible subset
        // (hidden frames excluded), so derive the targets and gate on their
        // count - not the parent's full selectedIds, which can include hidden
        // frames and yield "(1 devices)" labels / partial application. A
        // right-click outside the selection (or a single visible target) stays
        // single-device and keeps LED settings.
        const targets = selectedIds.has(dev.id) ? devices.filter(d => selectedIds.has(d.id)) : [dev];
        const group = targets.length >= 2;
        const count = targets.length;
        const items: DeviceMenuItem[] = [];
        // Identify only reaches LED-bearing devices; the group label counts just
        // those so it never promises to flash a frame with no LEDs.
        const ledTargets = targets.filter(d => d.ledCount > 0);
        if (ledTargets.length > 0) {
          items.push({
            key: 'identify', icon: <Eye size={14} />,
            label: group ? t('lighting.devices.identifyCount', { count: ledTargets.length }) : t('lighting.devices.identify'),
            onSelect: () => { ledTargets.forEach(d => identifyLightingDevice(d.id, 2000).catch(() => { /* silent */ })); },
          });
        }
        // LED-map editor is single-device only (it edits one device's zones), so
        // it is hidden for a group selection. For a single device it opens even
        // at 0 LEDs (positional mapping is always available).
        if (onOpenSettings && !group) {
          items.push({
            key: 'settings', icon: <Settings size={14} />, label: t('lighting.ledMap.settings'),
            onSelect: () => onOpenSettings(dev.id),
          });
        }
        // Group toggle reads "all maximized": minimize them only when every
        // target already fills the canvas, otherwise maximize them all.
        const maxed = group ? targets.every(isMaximized) : isMaximized(dev);
        items.push({
          key: 'maximize',
          icon: maxed ? <Minimize2 size={14} /> : <Maximize2 size={14} />,
          label: group
            ? (maxed ? t('lighting.devices.minimizeCount', { count }) : t('lighting.devices.maximizeCount', { count }))
            : (maxed ? t('lighting.devices.minimize') : t('lighting.devices.maximize')),
          onSelect: () => group ? handleMaximizeGroup(targets, !maxed) : handleMaximize(dev),
        });
        items.push({
          key: 'rotate-cw', icon: <RotateCw size={14} />,
          label: group ? t('lighting.devices.rotateCwCount', { count }) : t('lighting.devices.rotateCw'),
          onSelect: () => group ? handleRotateGroup(targets, 1) : handleRotate(dev, 1),
        });
        items.push({
          key: 'rotate-ccw', icon: <RotateCcw size={14} />,
          label: group ? t('lighting.devices.rotateCcwCount', { count }) : t('lighting.devices.rotateCcw'),
          onSelect: () => group ? handleRotateGroup(targets, -1) : handleRotate(dev, -1),
        });
        return (
          <DeviceContextMenu
            key={`${ctxMenu.id}:${ctxMenu.x}:${ctxMenu.y}`}
            x={ctxMenu.x} y={ctxMenu.y}
            items={items}
            onClose={() => setCtxMenu(null)}
          />
        );
      })()}
    </div>
  );
});

export function DeviceCanvas({ devices, canvasPixels, canvasW, canvasH, selectedIds, primaryDeviceId, onSelectDevice, onSetSelection, shaderEffect, shaderState, audioRef, hiddenFrameIds, selectedDeviceLeds, onOpenSettings, onDragActiveChange, onBeforeLayoutSave, onLayoutCommit, gpuAvailable }: DeviceCanvasProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const shaderStateRef = useRef(shaderState ?? null);
  // Latest-ref pattern: the shader renderer reads the ref every animation
  // frame; updating in an effect would lag by one paint and cause visible
  // tearing on parameter changes (palette/speed/etc).
   
  shaderStateRef.current = shaderState ?? null;
  const { ready } = useShaderRenderer(glCanvasRef, shaderEffect ?? null, shaderStateRef, audioRef);
  const visibleDevices = hiddenFrameIds && hiddenFrameIds.size > 0
    ? devices.filter(d => !hiddenFrameIds.has(d.id))
    : devices;
  return (
    <div ref={containerRef} className={styles.canvas}>
      <CanvasBackground canvasPixels={canvasPixels} canvasW={canvasW} canvasH={canvasH} />
      <canvas ref={glCanvasRef} className={`${styles.glCanvas} ${ready ? styles.glCanvasReady : ''}`} />
      <DeviceOverlays devices={visibleDevices} selectedIds={selectedIds} primaryDeviceId={primaryDeviceId} onSelectDevice={onSelectDevice} onSetSelection={onSetSelection} containerRef={containerRef} selectedDeviceLeds={selectedDeviceLeds} onOpenSettings={onOpenSettings} onDragActiveChange={onDragActiveChange} onBeforeLayoutSave={onBeforeLayoutSave} onLayoutCommit={onLayoutCommit} />
      <CanvasNoticeBar visible={gpuAvailable === false && shaderEffect != null} message={t('lighting.gpuUnavailableNotice')} />
    </div>
  );
}

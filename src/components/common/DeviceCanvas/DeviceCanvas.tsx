import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Eye, Layers, Maximize2, Minimize2, Power, PowerOff, RotateCcw, RotateCw, Settings } from 'lucide-react';
import type { LightingDevice, LedMapEntry } from '../../../api/lighting';
import { saveDeviceLayout, identifyLightingDevice } from '../../../api/lighting';
import type { AudioSnapshot } from '../../../hooks/useAudioState';
import { useShaderRenderer } from '../../../hooks/useShaderRenderer';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import { isMultiSelectModifier } from '../../../lib/platform';
import { paintLedFrame } from '../../../lib/ledFrame';
import { subscribeLedFrame } from '../../../lib/ledFrameStore';
import type { EffectState } from '../../../types/lighting';
import { CanvasNoticeBar } from '../CanvasNoticeBar';
import { gpuNotice, type GpuState } from '../CanvasNoticeBar/gpuNotice';
import { DeviceContextMenu, type DeviceMenuItem } from './DeviceContextMenu';
import { stackMenuItems, type StackActions } from './groupMenuItems';
import { sliceStackSlot, stackSlotOf, type DeviceStack } from '../../../lib/stackSlots';
import styles from './DeviceCanvas.module.scss';

interface DeviceCanvasProps {
  devices: LightingDevice[];
  /** Ids of the focused device frames. The canvas draws every device in
   *  `devices` whether focused or not, and this set can name one it is not
   *  drawing (a frame hidden by `hiddenFrameIds`, or one the caller dropped),
   *  so derive targets from `devices` rather than from this set. Single tap =
   *  1-element set, marquee = N-element set, Cmd/Ctrl+click = toggle
   *  membership. Focused frames keep the white outline and can be group-dragged
   *  together; every other frame recedes, all of them when the set is empty. */
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
  /** Freezes the shader preview's clock on its current frame (server-side
   *  lighting is frozen in lockstep). Only meaningful while shaderEffect is set. */
  shaderPaused?: boolean;
  audioRef?: React.RefObject<AudioSnapshot | null>;
  /** Device ids whose rectangle outline should be hidden on the canvas. View-only flag -
   *  the device still samples its rect for lighting; only the visual overlay is skipped. */
  hiddenFrameIds?: Set<string>;
  /** LED positions by device id; every selected frame draws the dots of each shown member it stands for. */
  selectedDeviceLeds?: Record<string, LedMapEntry[]> | null;
  /** Called when the user clicks the settings button on a device frame. */
  onOpenSettings?: (id: string) => void;
  /** Notifies parent when a drag starts or ends, so it can pause state updates. */
  onDragActiveChange?: (active: boolean) => void;
  /** Called before a layout-changing edit (first drag movement, rotate, maximize)
   *  so callers can snapshot for undo. Not fired for a tap that never moves. */
  onBeforeLayoutSave?: () => void;
  /** Called after a drag/rotate/maximize layout save completes, so callers can auto-save to the active preset. */
  onLayoutCommit?: () => void;
  /** Set power on/off for one or many device ids; caller persists to the active preset and pushes undo. */
  onSetDevicesPower?: (ids: string[], on: boolean) => void;
  gpuAvailable?: boolean;
  gpuState?: GpuState;
  /** Absent when the box has no second card to fall back to. */
  onPickRenderGpu?: () => void;
  /** Cards stacked to one frame: the first member drawn stands for the set,
   *  every layout edit on that frame lands on all of them, and each member's
   *  LED dots sit in the slot its stack layout gives it. */
  stacks?: DeviceStack[];
  /** The stack rows the frame menu offers over its targets. */
  stackActionsFor?: (ids: string[]) => StackActions;
}

const CW = 1000;
const CH = 600;
const PAD = 0;

/** The default card's shape, which the minimize preset also lands on. Roughly
 *  square so a grid or ring LED map is not letterboxed in it, and taller than
 *  the height floor LightingPage applies to every incoming device rect, so a
 *  minimized frame survives a reload unchanged (at 30 it silently came back
 *  doubled). */
const MIN_BOX_W = 140;
const MIN_BOX_H = 120;
/** Inset of the default grid. Distinct from PAD, which is the drag clamp. */
const GRID_PAD = 12;
/** Half the vertical offset between neighbouring grid columns. A name is drawn
 *  under its card, so a row of cards sharing one bottom edge stacks every name
 *  on that line. */
const COLUMN_STAGGER_Y = 24;

/** The slot a layout reset would give this device: a square-ish grid scaled to
 *  the device count, spread over the whole canvas, neighbouring columns offset
 *  vertically. Mirrors the service's CanvasGridLayout.Slot
 *  (nexus-service/src/Lighting/CanvasGridLayout.cs), which owns the same layout
 *  for fresh installs and for the reset endpoint. Change them together. */
function defaultSlot(index: number, totalCount: number): { x: number; y: number; w: number; h: number } {
  if (totalCount <= 0 || index < 0) return { x: GRID_PAD, y: GRID_PAD, w: MIN_BOX_W, h: MIN_BOX_H };
  const n = Math.max(1, totalCount);
  const availW = CW - 2 * GRID_PAD;
  const availH = CH - 2 * GRID_PAD;
  // cols ~ sqrt(n * aspect) so the grid mirrors the canvas shape.
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * (availW / availH))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = availW / cols;
  const cellH = availH / rows;
  // Held to the MIN_BOX aspect at every density: clamping each axis on its own
  // turns the card wide and short in a wide cell.
  const fit = Math.min(Math.min(MIN_BOX_W, cellW * 0.92) / MIN_BOX_W, Math.min(MIN_BOX_H, cellH * 0.7) / MIN_BOX_H);
  const w = MIN_BOX_W * fit;
  const h = MIN_BOX_H * fit;
  const total = cols * rows;
  const s = ((index % total) + total) % total;
  const col = s % cols;
  const row = Math.floor(s / cols);
  // Clamped to the cell's spare height so a staggered card cannot reach the
  // neighbouring row. Once the grid is dense enough for the clamp to bind, the
  // card sits flush to its cell edge and neighbouring columns separate by twice
  // the slack instead.
  const slack = (cellH - h) * 0.5;
  const stagger = Math.min(COLUMN_STAGGER_Y, slack);
  let x = GRID_PAD + col * cellW + (cellW - w) * 0.5;
  let y = GRID_PAD + row * cellH + slack + (col % 2 === 0 ? -stagger : stagger);
  if (x > CW - GRID_PAD - w) x = CW - GRID_PAD - w;
  if (y > CH - GRID_PAD - h) y = CH - GRID_PAD - h;
  if (x < GRID_PAD) x = GRID_PAD;
  if (y < GRID_PAD) y = GRID_PAD;
  return { x, y, w, h };
}

/** Returns each target to the default grid slot for its place among the frames
 *  on the canvas, so no two on-canvas frames can land on each other. Indexes into
 *  the frames the canvas holds, not the service's full device list, so a canvas
 *  with parked or powered-off frames hidden packs the rest gaplessly instead of
 *  reserving slots nothing occupies; it matches the reset layout exactly when
 *  none are hidden. A hidden frame keeps its own rect, so switching one back on
 *  can reveal it under a slot taken meanwhile. */
function minimizeInto(targets: LightingDevice[], all: LightingDevice[]): void {
  for (const t of targets) {
    const i = all.indexOf(t);
    const { x, y, w, h } = defaultSlot(i < 0 ? 0 : i, all.length);
    t.canvasX = x;
    t.canvasY = y;
    t.canvasW = w;
    t.canvasH = h;
  }
}

type DragMode = 'move' | 'resize-br' | 'rotate';

type FrameRect = Pick<LightingDevice, 'canvasX' | 'canvasY' | 'canvasW' | 'canvasH' | 'canvasRotation'>;

const normDeg = (deg: number): number => ((deg % 360) + 360) % 360;
const radOf = (d: FrameRect): number => normDeg(d.canvasRotation ?? 0) * Math.PI / 180;

/** The rect is the frame before it turns; the frame turns about the rect's
 *  centre by canvasRotation degrees clockwise, in canvas units. This is the
 *  turned frame's axis-aligned bounding box. */
function footprintOf(d: FrameRect): { x: number; y: number; w: number; h: number } {
  const rad = radOf(d);
  const c = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
  const w = d.canvasW * c + d.canvasH * sn;
  const h = d.canvasW * sn + d.canvasH * c;
  return { x: d.canvasX + d.canvasW / 2 - w / 2, y: d.canvasY + d.canvasH / 2 - h / 2, w, h };
}

/** Whether the canvas point lies inside the turned frame. */
function frameContains(d: FrameRect, px: number, py: number): boolean {
  const rad = radOf(d);
  const c = Math.cos(rad), sn = Math.sin(rad);
  const cx = d.canvasX + d.canvasW / 2, cy = d.canvasY + d.canvasH / 2;
  const dx = px - cx, dy = py - cy;
  const lx = dx * c + dy * sn, ly = -dx * sn + dy * c;
  return Math.abs(lx) <= d.canvasW / 2 && Math.abs(ly) <= d.canvasH / 2;
}

/** Shrinks the frame about its centre until its footprint fits the padded canvas. */
function fitInside(d: FrameRect): void {
  const fp = footprintOf(d);
  const fit = Math.min(1, (CW - 2 * PAD) / fp.w, (CH - 2 * PAD) / fp.h);
  if (fit >= 1) return;
  const cx = d.canvasX + d.canvasW / 2, cy = d.canvasY + d.canvasH / 2;
  d.canvasW *= fit;
  d.canvasH *= fit;
  d.canvasX = cx - d.canvasW / 2;
  d.canvasY = cy - d.canvasH / 2;
}

/** Moves the frame the least distance that puts its footprint inside the padded canvas; a footprint wider than the canvas stays put on that axis. */
function clampInside(d: FrameRect): void {
  const fp = footprintOf(d);
  if (fp.w <= CW - 2 * PAD) d.canvasX += fp.x < PAD ? PAD - fp.x : Math.min(0, CW - PAD - (fp.x + fp.w));
  if (fp.h <= CH - 2 * PAD) d.canvasY += fp.y < PAD ? PAD - fp.y : Math.min(0, CH - PAD - (fp.y + fp.h));
}

/** How far off a quarter turn the rotate grip still lands on one. */
const ROTATE_SNAP_DEG = 4;
/** The step the grip moves in while Shift is held. */
const ROTATE_STEP_DEG = 5;

function snapRotation(deg: number, stepped: boolean): number {
  const n = normDeg(deg);
  if (stepped) return normDeg(Math.round(n / ROTATE_STEP_DEG) * ROTATE_STEP_DEG);
  const quarter = Math.round(n / 90) * 90;
  return Math.abs(n - quarter) <= ROTATE_SNAP_DEG ? normDeg(quarter) : Math.round(n);
}

/** Label bounding box in canvas units. */
type LabelSize = { w: number; h: number };

/** Resolved label center in canvas units. */
type LabelPos = { cx: number; cy: number };

/** Gap between a frame's bottom edge and its name, and between stacked name rows. */
const LABEL_GAP = 5;

/** The name a frame wears: the card's own part of a hardware name built as
 *  "{device} - {zone}" (or "{board} - {port} - {product}" on a chained port),
 *  which is the context the rail needs and the canvas cannot fit. A renamed
 *  card (originalName set) shows its name verbatim: a human typed it, dashes
 *  and all. */
export function canvasLabelName(dev: Pick<LightingDevice, 'name' | 'originalName'>): string {
  if (dev.originalName != null) return dev.name;
  const last = dev.name.lastIndexOf(' - ');
  if (last < 0) return dev.name;
  const own = dev.name.slice(last + 3).trim();
  return own || dev.name;
}

/** Resolves each label's center so no two labels overlap. A label sits just
 *  under its frame, centred on it, and steps down/up in alternating whole-row
 *  increments until its box is clear, so labels that are far apart
 *  horizontally never move. Smallest frames place first: a large frame's label
 *  yields to the small frames stacked on top of it.
 *  `pinned` ids place before everything: they hold their home row and the
 *  rest yield, so the name on the card the user is dragging or has selected
 *  tracks its frame instead of hopping rows as other labels come and go.
 *  Returns id -> center in canvas units; ids with no measured size are absent. */
function layoutLabels(
  devices: LightingDevice[],
  sizes: Map<string, LabelSize>,
  pinned?: Set<string> | null,
): Map<string, LabelPos> {
  const out = new Map<string, LabelPos>();
  const placed: { x1: number; x2: number; y1: number; y2: number }[] = [];
  // Pinned first, then area ascending, id as tie-break so placement is stable
  // across renders (equal-area frames must not swap rows on a re-render).
  const rank = (d: LightingDevice) => (pinned?.has(d.id) ? 0 : 1);
  const order = [...devices].sort((a, b) =>
    rank(a) - rank(b)
    || (a.canvasW * a.canvasH) - (b.canvasW * b.canvasH)
    || (a.id < b.id ? -1 : 1));
  for (const dev of order) {
    const size = sizes.get(dev.id);
    if (!size) continue;
    const halfW = size.w / 2;
    const halfH = size.h / 2;
    // The canvas clips overflow and the label is no longer nested in its frame,
    // so an edge-parked frame's name would lose text without this.
    const fp = footprintOf(dev);
    const cx = Math.max(halfW, Math.min(CW - halfW, fp.x + fp.w / 2));
    const x1 = cx - halfW;
    const x2 = cx + halfW;
    const step = size.h + LABEL_GAP;
    // Clamped so a bottom-edge frame keeps its name, over its own bottom band,
    // rather than losing it to the overflow clip.
    const home = Math.max(halfH, Math.min(CH - halfH, fp.y + fp.h + LABEL_GAP + halfH));
    let best = home;
    // The alternating sequence spends half its steps on the side the home row is
    // nearest, so the budget must span the canvas twice over to reach the far
    // edge from a row against either end. Too small and an edge-parked pile runs
    // out of steps with free rows below it.
    const maxK = Math.ceil(CH / step);
    for (let i = 0; i <= 2 * maxK; i++) {
      // 0, +1, -1, +2, -2 ... so a label settles on the nearest free row.
      const k = i === 0 ? 0 : (i % 2 === 1 ? Math.ceil(i / 2) : -Math.ceil(i / 2));
      const c = home + k * step;
      // Off-canvas candidates are skipped, not clamped onto the edge row, which
      // would retest one row many times over.
      if (c < halfH || c > CH - halfH) continue;
      const y1 = c - halfH;
      const y2 = c + halfH;
      if (!placed.some(p => !(p.x2 <= x1 || p.x1 >= x2 || p.y2 <= y1 || p.y1 >= y2))) {
        best = c;
        break;
      }
    }
    out.set(dev.id, { cx, cy: best });
    placed.push({ x1, x2, y1: best - halfH, y2: best + halfH });
  }
  return out;
}

// Paints from ledFrameStore: a pixels prop would re-render the lighting page per frame.
const CanvasBackground = memo(function CanvasBackground() {
  const bgRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => subscribeLedFrame(f => {
    const el = bgRef.current;
    if (el) paintLedFrame(el, f.pixels, f.w, f.h);
  }), []);

  return <canvas ref={bgRef} className={styles.bgCanvas} />;
});

const DeviceOverlays = memo(function DeviceOverlays({ devices, hiddenIds, selectedIds, primaryDeviceId, onSelectDevice, onSetSelection, containerRef, selectedDeviceLeds, onOpenSettings, onDragActiveChange, onBeforeLayoutSave, onLayoutCommit, onSetDevicesPower, stacks, stackActionsFor }: {
  /** Every device, hidden frames included: a hidden stack member still moves with its frame. */
  devices: LightingDevice[];
  /** Frames the eye is hiding: never drawn, never hit, but stacked ones follow their frame. */
  hiddenIds: Set<string>;
  selectedIds: Set<string>;
  primaryDeviceId: string | null;
  onSelectDevice: (id: string | null) => void;
  onSetSelection: (ids: Set<string>, primary: string | null) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedDeviceLeds?: Record<string, LedMapEntry[]> | null;
  onOpenSettings?: (id: string) => void;
  onDragActiveChange?: (active: boolean) => void;
  onBeforeLayoutSave?: () => void;
  onLayoutCommit?: () => void;
  onSetDevicesPower?: (ids: string[], on: boolean) => void;
  stacks?: DeviceStack[];
  stackActionsFor?: (ids: string[]) => StackActions;
}) {
  const { t, language } = useTranslation();
  // Stack members, self included; the first shown one owns the frame.
  const stackedWith = useCallback((id: string): string[] => stacks?.find(s => s.members.includes(id))?.members ?? [id], [stacks]);
  const frameOwner = useCallback((id: string): string => {
    const members = stackedWith(id);
    return members.length > 1 ? devices.find(d => members.includes(d.id) && !hiddenIds.has(d.id))?.id ?? id : id;
  }, [devices, hiddenIds, stackedWith]);
  const drawn = devices.filter(d => !hiddenIds.has(d.id) && frameOwner(d.id) === d.id);
  // `ids` with every stack filled in, over the devices the canvas holds.
  const withStacks = useCallback((ids: Iterable<string>): LightingDevice[] => {
    const all = new Set<string>();
    for (const id of ids) for (const m of stackedWith(id)) all.add(m);
    return devices.filter(d => all.has(d.id));
  }, [devices, stackedWith]);
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
    /** Set iff this is a group drag. Maps id -> orig top-left rect and its
     *  turned footprint. The dragged frame is included so the iteration is uniform. */
    groupOrigs?: Map<string, { x: number; y: number; w: number; h: number; fp: { x: number; y: number; w: number; h: number } }>;
    /** The group is one stack, not a multi-selection: a tap still cycles through the frames under it. */
    stackOnly?: boolean;
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
  // Labels render in their own layer above every frame, so hovering one cannot
  // reach its frame through CSS - the frame reads this to light itself up.
  const [hoveredLabelId, setHoveredLabelId] = useState<string | null>(null);
  const labelElsRef = useRef(new Map<string, HTMLSpanElement>());
  // Measured against the label layer, not containerRef: a parent's ref is still
  // null while this component's layout effect runs, so containerRef would skip
  // the first measure. The layer is inset:0 on the canvas, so the rect matches.
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const [labelSizes, setLabelSizes] = useState<Map<string, LabelSize>>(new Map());
  const containerSizeRef = useRef({ w: 733, h: 440 });
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
  const tapRef = useRef<{ prevPrimary: string | null; moved: boolean; viaLabel: boolean } | null>(null);
  // A rotate drag's running state, in canvas units, the space the rotation is
  // defined in: the frame centre the angle is read about, the last pointer
  // angle, the unwrapped sweep so far, and the rotation the drag started from.
  const rotateRef = useRef<{ cx: number; cy: number; lastAngle: number; turned: number; startRot: number } | null>(null);

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

  // Mutates dev in place; no save/render side effects so group rotation can
  // apply it to every target before a single batched save.
  const setRotation = useCallback((dev: LightingDevice, deg: number) => {
    dev.canvasRotation = normDeg(deg);
    fitInside(dev);
    clampInside(dev);
  }, []);
  const rotateDevice = useCallback((dev: LightingDevice, dir: 1 | -1) => {
    setRotation(dev, (dev.canvasRotation ?? 0) + dir * 90);
  }, [setRotation]);

  const startDrag = useCallback((e: React.PointerEvent, dev: LightingDevice, mode: DragMode, viaLabel = false) => {
    if (e.button !== 0) return; // right/middle click never starts a drag
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    tapRef.current = { prevPrimary: primaryDeviceIdRef.current, moved: false, viaLabel };
    onDragActiveChange?.(true);
    const p = toCanvas(e.clientX, e.clientY);
    if (mode === 'rotate') {
      const cx = dev.canvasX + dev.canvasW / 2, cy = dev.canvasY + dev.canvasH / 2;
      rotateRef.current = { cx, cy, lastAngle: Math.atan2(p.y - cy, p.x - cx), turned: 0, startRot: dev.canvasRotation ?? 0 };
    }
    // Group drag triggers when the user grabs a frame that's already part of a
    // multi-selection (size >= 2), and always carries the frame's stack.
    // Otherwise we collapse the selection to just the grabbed frame (matches
    // "click an unselected thing → select only it").
    const shownSelection = [...selectedIds].filter(id => !hiddenIds.has(id));
    const inSelection = selectedIds.has(dev.id) && shownSelection.length >= 2;
    if (!inSelection) {
      onSelectDevice(dev.id);
    }
    const dragged = withStacks(inSelection ? shownSelection : [dev.id]);
    const isGroup = mode === 'move' && dragged.length >= 2;
    const groupOrigs = isGroup
      ? new Map<string, { x: number; y: number; w: number; h: number; fp: { x: number; y: number; w: number; h: number } }>(
          dragged.map(d => [d.id, { x: d.canvasX, y: d.canvasY, w: d.canvasW, h: d.canvasH, fp: footprintOf(d) }])
        )
      : undefined;
    setDrag({ id: dev.id, mode, startX: p.x, startY: p.y, origX: dev.canvasX, origY: dev.canvasY, origW: dev.canvasW, origH: dev.canvasH, groupOrigs, stackOnly: isGroup && !inSelection });
  }, [toCanvas, onSelectDevice, onDragActiveChange, selectedIds, hiddenIds, withStacks]);

  // Cmd/Ctrl+click on a frame: toggle membership without starting a drag. Plain
  // click on a frame still falls through to startDrag. A stack toggles whole.
  const handleFramePointerDown = useCallback((e: React.PointerEvent, dev: LightingDevice, viaLabel = false) => {
    if (e.button !== 0) return; // right-click is handled by onContextMenu, not selection
    if (isMultiSelectModifier(e)) {
      e.preventDefault(); e.stopPropagation();
      const next = new Set(selectedIds);
      if (next.has(dev.id)) {
        for (const m of stackedWith(dev.id)) next.delete(m);
        // Removed primary: pick any remaining id as the new primary, prefer
        // the topmost (last in devices array). Empty set → primary null.
        let nextPrimary = primaryDeviceId;
        if (dev.id === primaryDeviceId) {
          nextPrimary = null;
          for (let i = devices.length - 1; i >= 0; i--) {
            if (next.has(devices[i].id)) { nextPrimary = devices[i].id; break; }
          }
        }
        onSetSelection(next, nextPrimary);
      } else {
        for (const m of stackedWith(dev.id)) next.add(m);
        // Newly-toggled-in id becomes primary so the side panel + LED dots
        // follow the user's latest interaction.
        onSetSelection(next, dev.id);
      }
      return;
    }
    startDrag(e, dev, 'move', viaLabel);
  }, [selectedIds, primaryDeviceId, devices, onSetSelection, startDrag, stackedWith]);

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
      for (const dev of drawn) {
        const fp = footprintOf(dev);
        if (!(fp.x + fp.w < x1 || fp.x > x2 || fp.y + fp.h < y1 || fp.y > y2)) {
          hits.add(dev.id);
        }
      }
      setMarquee({ ...marquee, curX: p.x, curY: p.y, moved, hits });
      // Push the live preview to the parent so the frames light up as the rect
      // crosses them. Primary stays pinned to whatever it was pre-drag so the
      // side panel does not flip with every frame the rect crosses.
      const effective = marquee.additive ? new Set([...marquee.preIds, ...hits]) : hits;
      onSetSelection(effective, primaryDeviceIdRef.current);
      return;
    }
    if (!drag) return;
    const p = toCanvas(e.clientX, e.clientY);
    if (drag.mode === 'rotate') {
      // The frame follows the pointer's sweep about its centre, landing on a
      // quarter turn when within ROTATE_SNAP_DEG of one, or in ROTATE_STEP_DEG
      // steps while Shift is held; the whole stack turns with it, since its
      // members share the rect.
      const r = rotateRef.current;
      if (!r) return;
      const angle = Math.atan2(p.y - r.cy, p.x - r.cx);
      let d = angle - r.lastAngle;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      r.lastAngle = angle;
      r.turned += d;
      const dev = devices.find(x => x.id === drag.id);
      if (!dev) return;
      const deg = snapRotation(r.startRot + r.turned * 180 / Math.PI, e.shiftKey);
      if (deg === normDeg(dev.canvasRotation ?? 0)) return;
      if (tapRef.current && !tapRef.current.moved) {
        tapRef.current.moved = true;
        onBeforeLayoutSaveRef.current?.();
      }
      // From the size the drag started at, not the running one: a sweep
      // through the diagonal fits the frame down and must grow it back.
      withStacks([dev.id]).forEach(m => {
        m.canvasX = drag.origX; m.canvasY = drag.origY; m.canvasW = drag.origW; m.canvasH = drag.origH;
        setRotation(m, deg);
      });
      forceRender(n => n + 1);
      return;
    }
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
        dxMin = Math.max(dxMin, PAD - orig.fp.x);
        dxMax = Math.min(dxMax, CW - PAD - orig.fp.w - orig.fp.x);
        dyMin = Math.max(dyMin, PAD - orig.fp.y);
        dyMax = Math.min(dyMax, CH - PAD - orig.fp.h - orig.fp.y);
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
      dev.canvasX = drag.origX + dx;
      dev.canvasY = drag.origY + dy;
      clampInside(dev);
    } else {
      const rad = radOf(dev);
      if (rad === 0) {
        dev.canvasW = Math.max(60, Math.min(CW - PAD - dev.canvasX, drag.origW + dx));
        dev.canvasH = Math.max(60, Math.min(CH - PAD - dev.canvasY, drag.origH + dy));
      } else {
        // The grip drags the frame's own bottom-right corner: the pointer delta
        // is read along the frame's axes and the opposite corner stays put, so
        // the centre the frame turns about moves with the resize.
        const c = Math.cos(rad), sn = Math.sin(rad);
        const w = Math.max(60, drag.origW + dx * c + dy * sn);
        const h = Math.max(60, drag.origH - dx * sn + dy * c);
        const ocx = drag.origX + drag.origW / 2, ocy = drag.origY + drag.origH / 2;
        const cornerX = ocx - (drag.origW / 2) * c + (drag.origH / 2) * sn;
        const cornerY = ocy - (drag.origW / 2) * sn - (drag.origH / 2) * c;
        dev.canvasW = w;
        dev.canvasH = h;
        dev.canvasX = cornerX + (w / 2) * c - (h / 2) * sn - w / 2;
        dev.canvasY = cornerY + (w / 2) * sn + (h / 2) * c - h / 2;
        fitInside(dev);
        clampInside(dev);
      }
      for (const m of stackedWith(dev.id)) {
        const stacked = devices.find(d => d.id === m);
        if (stacked && stacked !== dev) {
          stacked.canvasX = dev.canvasX; stacked.canvasY = dev.canvasY;
          stacked.canvasW = dev.canvasW; stacked.canvasH = dev.canvasH;
        }
      }
    }
    forceRender(n => n + 1);
  }, [drag, marquee, devices, drawn, toCanvas, onSetSelection, stackedWith, withStacks, setRotation]);

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
      // Primary = topmost (last in devices array) hit. Empty hit set → null primary.
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
        const members = stackedWith(dev.id);
        await Promise.all(devices.filter(d => members.includes(d.id)).map(d =>
          saveDeviceLayout(d.id, d.canvasX, d.canvasY, d.canvasW, d.canvasH, d.canvasRotation ?? 0),
        ));
        if (tap?.moved) onLayoutCommitRef.current?.();
      }
    }
    onDragActiveChange?.(false);
    setDrag(null);
    // A group is what a DRAG acts on; a tap that never moved narrows the focus
    // to the one frame it landed on. Without this the default "every frame
    // focused" state swallows the click that is meant to single one out.
    if (drag.groupOrigs && !drag.stackOnly && tap && !tap.moved) { onSelectDevice(drag.id); return; }
    // Tap-cycle (no drag, no group): step through the frames under the click
    // point, top first.
    // A tap on a name names its device outright, so it must not cycle - the
    // label is the escape hatch from having to guess the stacking order.
    if (!tap || tap.moved || tap.viaLabel || drag.mode !== 'move' || (drag.groupOrigs && !drag.stackOnly)) return;
    const underPointer = [...drawn].reverse().filter(d => frameContains(d, drag.startX, drag.startY));
    const idx = underPointer.findIndex(d => d.id === tap.prevPrimary);
    if (idx === -1) return; // fresh selection: topmost already selected via startDrag
    if (idx === underPointer.length - 1) { onSelectDevice(null); return; } // bottom-most already: deselect
    onSelectDevice(underPointer[idx + 1].id); // step one level deeper
  }, [drag, marquee, devices, drawn, stackedWith, onSelectDevice, onSetSelection, onDragActiveChange]);

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

  // Mutates dev's rect to the full canvas or to its default grid slot; no save/
  // render side effects so group maximize can set every target one direction.
  const setMaximized = useCallback((dev: LightingDevice, maximize: boolean) => {
    if (maximize) {
      dev.canvasX = PAD;
      dev.canvasY = PAD;
      dev.canvasW = CW - 2 * PAD;
      dev.canvasH = CH - 2 * PAD;
      // A turned frame's footprint overhangs the canvas at full size.
      fitInside(dev);
      clampInside(dev);
    } else {
      minimizeInto([dev], devices);
    }
  }, [devices]);

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

  // Lexend is font-display:swap, so a cold-cache first measure reads fallback
  // metrics that no signature here would invalidate. Re-measure once the real
  // face is active.
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    if (!document.fonts) return;
    let alive = true;
    void document.fonts.ready.then(() => { if (alive) setFontsTick(t => t + 1); });
    return () => { alive = false; };
  }, []);

  // How many cards the frame stands for, beside the stack glyph, with the
  // full sentence for the label's accessible name.
  const stackLabel = (dev: LightingDevice): { text: string; aria: string } | null => {
    const n = stackedWith(dev.id).length;
    return n > 1 ? { text: String(n), aria: t(pluralKey('lighting.devices.stackedCount', language, n), { count: n }) } : null;
  };
  // A stacked frame names the selected member - the primary, when that is one
  // of the stack. At rest, a stack made from a header carries
  // that header's name and one made from a selection wears its owner's.
  const frameName = (dev: LightingDevice): string => {
    const members = stackedWith(dev.id);
    if (members.length > 1 && primaryDeviceId && members.includes(primaryDeviceId)) {
      const primary = devices.find(d => d.id === primaryDeviceId);
      if (primary) return canvasLabelName(primary);
    }
    return stacks?.find(s => s.members.includes(dev.id))?.name || canvasLabelName(dev);
  };

  // A label's box only changes when its text, the font, or the container
  // scale does - never when a frame moves or turns. Keying the measure on that
  // signature keeps a drag (which re-renders at pointer rate) off the
  // layout-thrash path. JSON encodes the fields unambiguously without needing
  // a delimiter no device name can contain.
  const labelSig = JSON.stringify(drawn.map(d => [d.id, frameName(d), stackLabel(d)?.text ?? null]));
  const { w: contW, h: contH } = containerSizeRef.current;
  useLayoutEffect(() => {
    const el = labelLayerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const next = new Map<string, LabelSize>();
    for (const [id, span] of labelElsRef.current) {
      const b = span.getBoundingClientRect();
      next.set(id, { w: (b.width / r.width) * CW, h: (b.height / r.height) * CH });
    }
    setLabelSizes(prev => {
      const same = prev.size === next.size && [...next].every(([id, s]) => {
        const p = prev.get(id);
        return p != null && Math.abs(p.w - s.w) < 0.5 && Math.abs(p.h - s.h) < 0.5;
      });
      return same ? prev : next;
    });
  }, [labelSig, contW, contH, fontsTick]);

  // Recomputed every render: frame rects mutate in place during a drag, so a
  // memo keyed on them would serve a stale layout.
  // The dragged frames, plus the primary. Dropping the pin at pointer-up would
  // hand the home row straight back and hop the name the drag just held still;
  // the drag selects what it grabs, so the primary carries the pin afterwards.
  const pinnedIds = new Set<string>(
    drag ? (drag.groupOrigs ? [...drag.groupOrigs.keys()] : [drag.id]) : [],
  );
  if (primaryDeviceId) pinnedIds.add(primaryDeviceId);
  const labelLayout = layoutLabels(drawn, labelSizes, pinnedIds);

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
      {drawn.map(dev => {
        // selectedIds is kept in sync with the live marquee preview by
        // handlePointerMove, so no marquee-specific branch is needed here.
        const selected = selectedIds.has(dev.id);
        // Unfocused frames stay drawn and recede. An empty focus set recedes
        // every one of them - that is the "clicked empty canvas" state.
        const deemphasized = !selected;
        // The canvas is held at the unit space's 5:3, so a turn in units is a
        // plain rotation on screen.
        const rot = normDeg(dev.canvasRotation ?? 0);
        return (
          <div key={dev.id}
            className={`${styles.device} ${drag?.id === dev.id ? styles.dragging : ''} ${selected ? styles.selected : ''} ${deemphasized ? styles.deemphasized : ''} ${hoveredLabelId === dev.id ? styles.labelHover : ''}`}
            style={{
              left: `${(dev.canvasX / CW) * 100}%`, top: `${(dev.canvasY / CH) * 100}%`,
              width: `${(dev.canvasW / CW) * 100}%`, height: `${(dev.canvasH / CH) * 100}%`,
              transform: rot === 0 ? undefined : `rotate(${rot}deg)`,
            }}
            onPointerDown={e => handleFramePointerDown(e, dev)}
            onContextMenu={e => handleFrameContextMenu(e, dev)}>
            <div className={styles.resizeHandle} onPointerDown={e => startDrag(e, dev, 'resize-br')} />
            <div className={styles.rotateHandle} title={t('lighting.devices.rotateHandle')} onPointerDown={e => startDrag(e, dev, 'rotate')}>
              <RotateCw size={10} aria-hidden />
            </div>
            {selected && selectedDeviceLeds && stackedWith(dev.id)
              .filter(id => !hiddenIds.has(id))
              .flatMap(id => {
                // Stack members share one rect and turn with the frame, each
                // inside the slot the stack layout cuts for it - the engine
                // samples the same slot.
                const slot = stackSlotOf(stacks, id);
                const part = slot ? sliceStackSlot({ x: 0, y: 0, w: 1, h: 1 }, slot) : { x: 0, y: 0, w: 1, h: 1 };
                return (selectedDeviceLeds[id] ?? []).filter(l => !l.disabled).map(led => (
                  <div key={`${id}:${led.index}`} className={styles.ledDot} style={{ left: `${(part.x + led.u * part.w) * 100}%`, top: `${(part.y + led.v * part.h) * 100}%` }} />
                ));
              })
            }
          </div>
        );
      })}
      {/* Labels live above every frame so a name is always readable and always
          hittable, whatever the frame stacking is. The layer itself is
          click-through; only the names take pointer events. A name sits under
          its frame and stays horizontal: rotation already shows in the turned
          frame and its LED dots. */}
      <div ref={labelLayerRef} className={styles.labelLayer}>
        {drawn.map(dev => {
          const selected = selectedIds.has(dev.id);
          const deemphasized = !selected;
          // Pre-measure fallback sits on the frame's bottom edge; the layout
          // effect measures before paint, so it is never drawn.
          const pos = labelLayout.get(dev.id);
          const fp = footprintOf(dev);
          const cx = pos?.cx ?? fp.x + fp.w / 2;
          const cy = pos?.cy ?? fp.y + fp.h + LABEL_GAP;
          return (
            <span key={dev.id}
              ref={el => { if (el) labelElsRef.current.set(dev.id, el); else labelElsRef.current.delete(dev.id); }}
              className={`${styles.deviceLabel} ${deemphasized ? styles.deemphasized : ''}`}
              style={{
                left: `${(cx / CW) * 100}%`, top: `${(cy / CH) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
              onPointerDown={e => handleFramePointerDown(e, dev, true)}
              onContextMenu={e => handleFrameContextMenu(e, dev)}
              onPointerEnter={() => setHoveredLabelId(dev.id)}
              onPointerLeave={() => setHoveredLabelId(cur => (cur === dev.id ? null : cur))}>
              {frameName(dev)}
              {(() => {
                const stack = stackLabel(dev);
                return stack && (
                  <span className={styles.deviceLabelStacked} role="img" aria-label={stack.aria}>
                    <Layers size={11} aria-hidden />{stack.text}
                  </span>
                );
              })()}
            </span>
          );
        })}
      </div>
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
        // A stacked frame's targets are its whole stack, hidden members included,
        // so every row keeps the stack on one rect.
        const picked = selectedIds.has(dev.id) ? drawn.filter(d => selectedIds.has(d.id)) : [dev];
        const targets = withStacks(picked.map(d => d.id));
        const group = targets.length >= 2;
        const count = targets.length;
        const items: DeviceMenuItem[] = [];
        // Identify only reaches LED-bearing devices; the group label counts just
        // those so it never promises to flash a frame with no LEDs.
        const ledTargets = targets.filter(d => d.ledCount > 0);
        if (ledTargets.length > 0) {
          items.push({
            key: 'identify', icon: <Eye size={14} />,
            label: group
              ? t(pluralKey('lighting.devices.identifyCount', language, ledTargets.length), { count: ledTargets.length })
              : t('lighting.devices.identify'),
            onSelect: () => { ledTargets.forEach(d => identifyLightingDevice(d.id, 2000).catch(() => { /* silent */ })); },
          });
        }
        // LED-map editor is single-device only (it edits one device's zones), so
        // it is hidden for a group selection. For a single device it opens even
        // at 0 LEDs (positional mapping is always available).
        if (onOpenSettings && picked.length === 1) {
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
            ? t(pluralKey(maxed ? 'lighting.devices.minimizeCount' : 'lighting.devices.maximizeCount', language, count), { count })
            : (maxed ? t('lighting.devices.minimize') : t('lighting.devices.maximize')),
          onSelect: () => group ? handleMaximizeGroup(targets, !maxed) : handleMaximize(dev),
        });
        items.push({
          key: 'rotate-cw', icon: <RotateCw size={14} />,
          label: group ? t(pluralKey('lighting.devices.rotateCwCount', language, count), { count }) : t('lighting.devices.rotateCw'),
          onSelect: () => group ? handleRotateGroup(targets, 1) : handleRotate(dev, 1),
        });
        items.push({
          key: 'rotate-ccw', icon: <RotateCcw size={14} />,
          label: group ? t(pluralKey('lighting.devices.rotateCcwCount', language, count), { count }) : t('lighting.devices.rotateCcw'),
          onSelect: () => group ? handleRotateGroup(targets, -1) : handleRotate(dev, -1),
        });
        const anyOn = targets.some(d => d.ledsOn);
        items.push({
          key: 'power',
          icon: anyOn ? <PowerOff size={14} /> : <Power size={14} />,
          label: group
            ? t(pluralKey(anyOn ? 'lighting.devices.menuLightsOffCount' : 'lighting.devices.menuLightsOnCount', language, count), { count })
            : t(anyOn ? 'lighting.devices.menuLightsOff' : 'lighting.devices.menuLightsOn'),
          onSelect: () => onSetDevicesPower?.(targets.map(d => d.id), !anyOn),
        });
        const stackRows = stackMenuItems(t, language, stackActionsFor?.(targets.map(d => d.id)), count);
        if (stackRows.length > 0) {
          items[items.length - 1].separatorAfter = true;
          items.push(...stackRows);
        }
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

export function DeviceCanvas({ devices, selectedIds, primaryDeviceId, onSelectDevice, onSetSelection, shaderEffect, shaderState, shaderPaused, audioRef, hiddenFrameIds, selectedDeviceLeds, onOpenSettings, onDragActiveChange, onBeforeLayoutSave, onLayoutCommit, onSetDevicesPower, gpuAvailable, gpuState, onPickRenderGpu, stacks, stackActionsFor }: DeviceCanvasProps) {
  const notice = gpuNotice(gpuState, gpuAvailable);
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const shaderStateRef = useRef(shaderState ?? null);
  // Latest-ref pattern: the shader renderer reads the ref every animation
  // frame; updating in an effect would lag by one paint and cause visible
  // tearing on parameter changes (palette/speed/etc).

  shaderStateRef.current = shaderState ?? null;
  const { ready } = useShaderRenderer(glCanvasRef, shaderEffect ?? null, shaderStateRef, audioRef, undefined, shaderPaused);
  const hiddenIds = hiddenFrameIds ?? new Set<string>();
  return (
    <div ref={containerRef} className={styles.canvas}>
      <CanvasBackground />
      <canvas ref={glCanvasRef} className={`${styles.glCanvas} ${ready ? styles.glCanvasReady : ''}`} />
      <DeviceOverlays devices={devices} hiddenIds={hiddenIds} selectedIds={selectedIds} primaryDeviceId={primaryDeviceId} onSelectDevice={onSelectDevice} onSetSelection={onSetSelection} containerRef={containerRef} selectedDeviceLeds={selectedDeviceLeds} onOpenSettings={onOpenSettings} onDragActiveChange={onDragActiveChange} onBeforeLayoutSave={onBeforeLayoutSave} onLayoutCommit={onLayoutCommit} onSetDevicesPower={onSetDevicesPower} stacks={stacks} stackActionsFor={stackActionsFor} />
      <CanvasNoticeBar
        visible={notice != null && shaderEffect != null}
        message={notice ? t(notice.key) : ''}
        tone={notice?.tone}
        action={onPickRenderGpu ? { label: t('lighting.gpuPickGpu'), onClick: onPickRenderGpu } : undefined}
      />
    </div>
  );
}

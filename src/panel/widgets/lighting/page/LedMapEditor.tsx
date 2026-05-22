import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Undo2, Redo2, AlignHorizontalDistributeCenter, Grid3x3, RotateCw,
  Trash2, FlipHorizontal2, FlipVertical2, RotateCcw, CheckSquare, Square, Sun, SunDim,
} from 'lucide-react';
import {
  fetchLedMap, fetchLedMapDefaults, saveLedMap, resetLedMap, highlightLeds, testLedPattern, clearLedEditor,
  setZoneLedCount, setLightingDeviceBrightness,
  type LedMapEntry, type LightingDevice,
} from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import { DeviceModal } from '../../../../components/common/DeviceModal/DeviceModal';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Slider } from '../../../../components/common/Slider/Slider';
import { useThrottle } from '../../../../hooks/cadence';
import styles from './LedMapEditor.module.scss';

const isMac = /mac/i.test(navigator.userAgent);
const DEFAULT_RATIO = 16 / 9;
const RECT_PAD_PX = 10;
const MAX_HISTORY = 50;
// Fraction of the selected LEDs' bbox edge to pad on each side when running
// a group op (align as strip / grid / rotate). Gives the LEDs breathing room
// inside the selection so they don't end up sitting right on the edges.
const SELECTION_BBOX_PAD_UV = 0.04;
// Height (canvas %) of the parking row below the device frame where deleted
// LEDs sit. Enough to show the LED circle + 1-indexed label comfortably.
const PARK_ROW_HEIGHT = 11;
// Pixel nudge step for arrow-key movement. Shift multiplies this by 5 for
// coarse nudges when reshaping wide selections.
const NUDGE_STEP_UV = 0.005;
const NUDGE_STEP_UV_COARSE = 0.025;

type EditorMode = 'animation' | 'horizontal' | 'vertical' | 'none';

type Snapshot = { leds: LedMapEntry[]; rectRatio: number; ledCount: number };

const SELECTION_HANDLE_CLASS: Record<'nw' | 'ne' | 'sw' | 'se', string> = {
  nw: styles.selectionHandleNW,
  ne: styles.selectionHandleNE,
  sw: styles.selectionHandleSW,
  se: styles.selectionHandleSE,
};

interface Props {
  device: LightingDevice;
  onClose: () => void;
}

export function LedMapEditor({ device, onClose }: Props) {
  const deviceId = device.id;
  const deviceName = device.name;
  const [liveLedCount, setLiveLedCount] = useState<number>(device.ledCount);
  const liveLedCountRef = useRef(liveLedCount);
  liveLedCountRef.current = liveLedCount;
  const [ledCountDraft, setLedCountDraft] = useState(String(device.ledCount));
  const ledCountEscapeRef = useRef(false);
  const countChangingRef = useRef(false);
  // Per-device brightness multiplier (0..100). Multiplies the global brightness
  // slider so the effective output is `global * device / 100`. Default 100% so
  // existing devices light up at full brightness until the user dials it down.
  const [brightness, setBrightness] = useState<number>(device.brightness ?? 100);
  const brightnessThrottle = useThrottle();
  const sendBrightness = useCallback((value: number) => {
    setLightingDeviceBrightness(device.id, value).catch(() => { /* best-effort */ });
  }, [device.id]);
  const handleBrightnessChange = useCallback((value: number) => {
    setBrightness(value);
    brightnessThrottle(() => sendBrightness(value));
  }, [brightnessThrottle, sendBrightness]);
  const handleBrightnessCommit = useCallback((value: number) => {
    sendBrightness(value);
  }, [sendBrightness]);
  // Only motherboard ARGB zones with the `zoneResizable` flag accept
  // resize opcodes; keyboard matrices, GPU strips, etc. have fixed counts.
  const canEditLedCount = device.zoneResizable === true;
  const { t } = useTranslation();
  const [leds, setLeds] = useState<LedMapEntry[]>([]);
  const defaultLedsRef = useRef<LedMapEntry[]>([]);
  // Snapshot of the last-saved (u, v, disabled) per LED index. Anything
  // that diverges from this snapshot counts as "unsaved" and earns the
  // dashed outline in the editor. Reset on load and on save-complete so
  // persisted customisations no longer carry the dashed ring.
  const [savedLedsMap, setSavedLedsMap] = useState<Map<number, { u: number; v: number; disabled: boolean }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hoveredLed, setHoveredLed] = useState<number | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragDelta, setDragDelta] = useState<{ du: number; dv: number } | null>(null);
  // Free-cursor drag for a single parked LED. The stored u,v is not useful
  // mid-drag (it's frozen at the last in-frame position); we track the
  // cursor directly and only commit a new u,v on release inside the frame.
  const [parkedDrag, setParkedDrag] = useState<{ index: number; cx: number; cy: number } | null>(null);

  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [marqueeActive, setMarqueeActive] = useState(false);
  const marqueeAdditiveRef = useRef(false);
  const preMarqueeSelectionRef = useRef<Set<number>>(new Set());

  const [editorMode, setEditorMode] = useState<EditorMode>('animation');

  // Zone layer toggles - all enabled by default
  const [enabledZones, setEnabledZones] = useState<Set<string>>(new Set());

  const [devRect, setDevRect] = useState({ x: 10, y: 10, w: 80, h: 80 });
  const [rectResizing, setRectResizing] = useState(false);
  // Selection-bbox resize: drag a corner handle to proportionally stretch
  // every selected LED relative to the fixed opposite corner.
  const [selectionResizing, setSelectionResizing] = useState(false);
  const selectionResizeRef = useRef<{
    corner: 'nw' | 'ne' | 'sw' | 'se';
    anchorU: number;
    anchorV: number;
    origU: number; // initial dragged-corner UV coords
    origV: number;
    initialLeds: Map<number, { u: number; v: number }>;
  } | null>(null);
  const rectResizeRef = useRef<{ startX: number; startY: number; rect: typeof devRect } | null>(null);
  const [rectRatio, setRectRatio] = useState(DEFAULT_RATIO);

  const undoStackRef = useRef<Snapshot[]>([]);
  const redoStackRef = useRef<Snapshot[]>([]);
  const [undoLen, setUndoLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);
  const ledsRef = useRef(leds);
  ledsRef.current = leds;
  const rectRatioRef = useRef(rectRatio);
  rectRatioRef.current = rectRatio;

  const [sweepPhase, setSweepPhase] = useState(0);
  const sweepStartRef = useRef(0);

  const canvasRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the most recent pointermove cursor position in canvas percent
  // units so pointerup / pointerleave can consult an accurate cursor even
  // if the native event arrives without coordinates (e.g. pointerLeave
  // fired after the cursor already left the canvas).
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Confirm dialog state for "close with unsaved changes" prompt.
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Distinct zone types present in this device
  const zoneTypes = useMemo(() => {
    const types = new Set<string>();
    for (const l of leds) {
      if (l.zoneType) types.add(l.zoneType);
    }
    return Array.from(types);
  }, [leds]);

  // Initialize enabledZones once when LEDs first load
  const zonesInitialized = useRef(false);
  useEffect(() => {
    if (zoneTypes.length > 0 && !zonesInitialized.current) {
      zonesInitialized.current = true;
      setEnabledZones(new Set(zoneTypes));
    }
  }, [zoneTypes]);

  const isLedEnabled = useCallback((led: LedMapEntry) =>
    enabledZones.has(led.zoneType), [enabledZones]);

  const zoneLabel = (z: string) => {
    switch (z) {
      case 'matrix': return t('lighting.ledMap.zoneMatrix');
      case 'linear': return t('lighting.ledMap.zoneLinear');
      case 'single': return t('lighting.ledMap.zoneSingle');
      default: return z;
    }
  };

  const toggleZone = (zone: string) => {
    let nextEnabled: Set<string>;
    setEnabledZones(prev => {
      nextEnabled = new Set(prev);
      if (nextEnabled.has(zone)) {
        nextEnabled.delete(zone);
      } else {
        nextEnabled.add(zone);
      }
      return nextEnabled;
    });
    setSelected(prev => {
      const next = new Set<number>();
      for (const idx of prev) {
        const led = leds.find(l => l.index === idx);
        if (led && nextEnabled!.has(led.zoneType)) next.add(idx);
      }
      return next;
    });
  };

  const pushUndo = useCallback(() => {
    undoStackRef.current.push({ leds: ledsRef.current.map(l => ({ ...l })), rectRatio: rectRatioRef.current, ledCount: liveLedCountRef.current });
    if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
    redoStackRef.current = [];
    setUndoLen(undoStackRef.current.length);
    setRedoLen(0);
  }, []);

  const handleUndo = useCallback(async () => {
    const stack = undoStackRef.current;
    if (stack.length === 0 || countChangingRef.current) return;
    const snap = stack.pop()!;
    const current: Snapshot = { leds: ledsRef.current.map(l => ({ ...l })), rectRatio: rectRatioRef.current, ledCount: liveLedCountRef.current };
    redoStackRef.current.push(current);
    if (snap.ledCount !== current.ledCount) {
      countChangingRef.current = true;
      setLiveLedCount(snap.ledCount);
      try {
        await setZoneLedCount(deviceId, snap.ledCount);
      } catch {
        stack.push(snap);
        redoStackRef.current.pop();
        setLiveLedCount(current.ledCount);
        setUndoLen(stack.length);
        setRedoLen(redoStackRef.current.length);
        countChangingRef.current = false;
        return;
      }
      countChangingRef.current = false;
    }
    setLeds(snap.leds);
    setRectRatio(snap.rectRatio);
    setDirty(true);
    setUndoLen(stack.length);
    setRedoLen(redoStackRef.current.length);
  }, [deviceId]);

  const handleRedo = useCallback(async () => {
    const stack = redoStackRef.current;
    if (stack.length === 0 || countChangingRef.current) return;
    const snap = stack.pop()!;
    const current: Snapshot = { leds: ledsRef.current.map(l => ({ ...l })), rectRatio: rectRatioRef.current, ledCount: liveLedCountRef.current };
    undoStackRef.current.push(current);
    if (snap.ledCount !== current.ledCount) {
      countChangingRef.current = true;
      setLiveLedCount(snap.ledCount);
      try {
        await setZoneLedCount(deviceId, snap.ledCount);
      } catch {
        stack.push(snap);
        undoStackRef.current.pop();
        setLiveLedCount(current.ledCount);
        setUndoLen(undoStackRef.current.length);
        setRedoLen(stack.length);
        countChangingRef.current = false;
        return;
      }
      countChangingRef.current = false;
    }
    setLeds(snap.leds);
    setRectRatio(snap.rectRatio);
    setDirty(true);
    setUndoLen(undoStackRef.current.length);
    setRedoLen(stack.length);
  }, [deviceId]);

  // Holds the latest shortcut handlers so the keydown effect can run without
  // depending on handler identity (some of those handlers are declared further
  // down and can't be forward-referenced in a useCallback dep array).
  const shortcutHandlersRef = useRef<{
    selectAll: () => void;
    deleteSelected: () => void;
    nudge: (du: number, dv: number) => void;
    undo: () => void;
    redo: () => void;
  }>({ selectAll: () => { }, deleteSelected: () => { }, nudge: () => { }, undo: () => { }, redo: () => { } });
  // Tracks the current selection size so the Escape branch can decide
  // whether to clear-selection-only (stop propagation) vs bubble to
  // DeviceModal to trigger close. Sync'd in render below.
  const selectedSizeRef = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore keys when focus is in an editable field so the EditableNumber
      // count input and any future text inputs don't hijack arrows / delete.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const h = shortcutHandlersRef.current;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.code === 'KeyA') { e.preventDefault(); h.selectAll(); return; }
      // Use e.code for Z-based shortcuts because e.key returns 'Z' (upper-
      // case) when Shift is held, which would never match 'z'. e.code is
      // layout-independent and always "KeyZ" for that physical key.
      if (mod && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); h.undo(); return; }
      if (mod && e.code === 'KeyZ' && e.shiftKey) { e.preventDefault(); h.redo(); return; }
      if (mod) return;
      if (e.key === 'Escape') {
        // Escape clears the selection when something is selected; only if
        // nothing is selected do we bubble to DeviceModal to close. Stop
        // propagation in the clear case so the modal doesn't also try to
        // close (which would re-trigger the unsaved-changes confirm).
        if (selectedSizeRef.current > 0) {
          e.preventDefault();
          e.stopPropagation();
          setSelected(new Set());
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); h.deleteSelected(); return; }
      const step = e.shiftKey ? NUDGE_STEP_UV_COARSE : NUDGE_STEP_UV;
      if (e.key === 'ArrowLeft') { e.preventDefault(); h.nudge(-step, 0); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); h.nudge(step, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); h.nudge(0, -step); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); h.nudge(0, step); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const load = useCallback(async (preserveHistory = false) => {
    setLoading(true);
    const [resp, defResp] = await Promise.all([
      fetchLedMap(deviceId),
      fetchLedMapDefaults(deviceId),
    ]);
    if (resp) {
      const active = resp.leds.filter(l => !l.disabled);
      let ledsToSet = resp.leds;
      // If all active LEDs are piled on the same point (no saved layout yet),
      // spread them into a grid so the user has something to work with.
      if (active.length > 1) {
        let uMin = active[0].u, uMax = uMin, vMin = active[0].v, vMax = vMin;
        for (const l of active) {
          if (l.u < uMin) uMin = l.u; if (l.u > uMax) uMax = l.u;
          if (l.v < vMin) vMin = l.v; if (l.v > vMax) vMax = l.v;
        }
        const uSpread = uMax - uMin;
        const vSpread = vMax - vMin;
        if (uSpread < 0.02 && vSpread < 0.02) {
          const n = active.length;
          const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));
          const rows = Math.max(1, Math.ceil(n / cols));
          const pad = 0.08;
          const sorted = [...active].sort((a, b) => a.index - b.index);
          const gridMap = new Map<number, { u: number; v: number }>();
          sorted.forEach((led, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            gridMap.set(led.index, {
              u: cols > 1 ? pad + (c / (cols - 1)) * (1 - 2 * pad) : 0.5,
              v: rows > 1 ? pad + (r / (rows - 1)) * (1 - 2 * pad) : 0.5,
            });
          });
          ledsToSet = resp.leds.map(l => {
            const g = gridMap.get(l.index);
            return g ? { ...l, u: g.u, v: g.v } : l;
          });
        }
      }
      setLeds(ledsToSet);
      setLiveLedCount(resp.ledCount);
      const snap = new Map<number, { u: number; v: number; disabled: boolean }>();
      for (const l of ledsToSet) snap.set(l.index, { u: l.u, v: l.v, disabled: l.disabled });
      setSavedLedsMap(snap);
      if (resp.aspectRatio > 0) {
        setRectRatio(resp.aspectRatio);
      }
    }
    if (defResp) {
      defaultLedsRef.current = defResp.leds;
    }
    if (!preserveHistory) {
      undoStackRef.current = [];
      redoStackRef.current = [];
      setUndoLen(0);
      setRedoLen(0);
    }
    setLoading(false);
    setDirty(false);
    setSelected(new Set());
    setEnabledZones(new Set());
    zonesInitialized.current = false;
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { setLedCountDraft(String(liveLedCount)); }, [liveLedCount]);

  useEffect(() => {
    return () => { clearLedEditor(deviceId); };
  }, [deviceId]);

  // Animate the sweep line when a directional test pattern is active.
  // Phase resets to 0 on each mode activation so the UI bar starts at the
  // same position as the hardware (which also resets its phase timer when
  // the pattern POST is received, giving sub-network-latency sync).
  useEffect(() => {
    if (editorMode === 'animation' || editorMode === 'none' || selected.size > 0) {
      setSweepPhase(0);
      return;
    }
    sweepStartRef.current = performance.now();
    let raf: number;
    const tick = () => {
      setSweepPhase(((performance.now() - sweepStartRef.current) % 2000) / 2000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [editorMode, selected.size]);

  const sendHighlight = useCallback((sel: Set<number>) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      highlightLeds(deviceId, Array.from(sel));
    }, 30);
  }, [deviceId]);

  useEffect(() => {
    sendHighlight(selected);
  }, [selected, sendHighlight]);

  useEffect(() => {
    if (selected.size === 0) {
      testLedPattern(deviceId, editorMode);
    }
  }, [editorMode, selected.size, deviceId]);

  const showUnsavedConfirmRef = useRef(showUnsavedConfirm);
  showUnsavedConfirmRef.current = showUnsavedConfirm;
  const handleClose = useCallback(() => {
    // Confirm dialog owns Escape while it's open - don't loop the prompt.
    if (showUnsavedConfirmRef.current) return;
    if (dirtyRef.current) {
      setShowUnsavedConfirm(true);
      return;
    }
    clearLedEditor(deviceId);
    onClose();
  }, [deviceId, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowUnsavedConfirm(false);
    clearLedEditor(deviceId);
    onClose();
  }, [deviceId, onClose]);

  const isMultiKey = (e: React.PointerEvent | React.MouseEvent) =>
    isMac ? e.metaKey : e.ctrlKey;

  const getCanvasPercent = (e: React.PointerEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };

  const getPadPercent = useCallback(() => {
    if (!canvasRef.current) return { px: 0, py: 0 };
    const r = canvasRef.current.getBoundingClientRect();
    return {
      px: (RECT_PAD_PX / r.width) * 100,
      py: (RECT_PAD_PX / r.height) * 100,
    };
  }, []);

  const uvToCanvas = useCallback((u: number, v: number) => {
    const pad = getPadPercent();
    return {
      cx: devRect.x + pad.px + u * (devRect.w - 2 * pad.px),
      cy: devRect.y + pad.py + v * (devRect.h - 2 * pad.py),
    };
  }, [devRect, getPadPercent]);

  const canvasToUv = useCallback((cx: number, cy: number) => {
    const pad = getPadPercent();
    const innerW = devRect.w - 2 * pad.px;
    const innerH = devRect.h - 2 * pad.py;
    return {
      u: innerW > 0 ? (cx - devRect.x - pad.px) / innerW : 0,
      v: innerH > 0 ? (cy - devRect.y - pad.py) / innerH : 0,
    };
  }, [devRect, getPadPercent]);

  // Canvas-space point a given LED occupies. Disabled LEDs don't live at
  // their stored u,v - they sit in the "parking row" just below the device
  // frame at equidistant horizontal positions. LED indices remain the same
  // so the user can see which number maps to which parked circle.
  // disabledOrder: the sorted list of disabled LED indices in the current
  // map, so each disabled LED knows its slot + the total number of slots.
  const getLedCanvasPos = useCallback((led: LedMapEntry, disabledOrder: number[], dragOverride?: { du: number; dv: number }) => {
    if (parkedDrag && parkedDrag.index === led.index) {
      return { cx: parkedDrag.cx, cy: parkedDrag.cy };
    }
    if (led.disabled) {
      const n = disabledOrder.length;
      const slot = Math.max(0, disabledOrder.indexOf(led.index));
      const u = n > 1 ? (slot + 0.5) / n : 0.5;
      const cx = u * 100;
      // Clamp so the parking row stays visible even when the device rect
      // was resized large enough to touch the canvas bottom.
      const cy = Math.min(devRect.y + devRect.h + PARK_ROW_HEIGHT * 0.5, 100 - PARK_ROW_HEIGHT * 0.5);
      return { cx, cy };
    }
    let u = led.u;
    let v = led.v;
    if (dragOverride && selected.has(led.index)) {
      u = Math.max(0, Math.min(1, u + dragOverride.du));
      v = Math.max(0, Math.min(1, v + dragOverride.dv));
    }
    return uvToCanvas(u, v);
  }, [uvToCanvas, devRect, selected, parkedDrag]);

  // Canvas point is "inside the device frame" when within the padded inner
  // rect. Used to decide whether a dragged LED should be re-enabled (dropped
  // inside) or parked (dropped outside).
  const isInsideFrame = useCallback((cx: number, cy: number) => {
    const pad = getPadPercent();
    return cx >= devRect.x + pad.px && cx <= devRect.x + devRect.w - pad.px
      && cy >= devRect.y + pad.py && cy <= devRect.y + devRect.h - pad.py;
  }, [devRect, getPadPercent]);

  const computeMarqueeSelection = useCallback((m: { x1: number; y1: number; x2: number; y2: number }) => {
    const minX = Math.min(m.x1, m.x2);
    const maxX = Math.max(m.x1, m.x2);
    const minY = Math.min(m.y1, m.y2);
    const maxY = Math.max(m.y1, m.y2);

    // Compute the parked row slots inline so the marquee can hit-test them
    // correctly - using the LED's stored u,v would point at wherever the
    // LED was before it was parked, not at the parking row below the frame.
    const parkedIndices = leds.filter(l => l.disabled).map(l => l.index).sort((a, b) => a - b);
    const parkedN = parkedIndices.length;

    const inBox = new Set<number>();
    for (const led of leds) {
      if (!enabledZones.has(led.zoneType)) continue;
      let cx: number, cy: number;
      if (led.disabled) {
        const slot = parkedIndices.indexOf(led.index);
        const u = parkedN > 1 ? (slot + 0.5) / parkedN : 0.5;
        cx = u * 100;
        cy = Math.min(devRect.y + devRect.h + PARK_ROW_HEIGHT * 0.5, 100 - PARK_ROW_HEIGHT * 0.5);
      } else {
        const pos = uvToCanvas(led.u, led.v);
        cx = pos.cx;
        cy = pos.cy;
      }
      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
        inBox.add(led.index);
      }
    }

    if (marqueeAdditiveRef.current) {
      const merged = new Set(preMarqueeSelectionRef.current);
      for (const idx of inBox) merged.add(idx);
      return merged;
    }
    return inBox;
  }, [leds, uvToCanvas, enabledZones, devRect]);

  const handleLedPointerDown = (e: React.PointerEvent, ledIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    // Capture the pointer on the canvas so drag-out-bottom (auto-park) and
    // parked-drag-back-in fire a real pointerup event with correct coords
    // instead of pointerLeave with stale / missing coords.
    if (canvasRef.current) {
      try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    lastPointerRef.current = getCanvasPercent(e);

    const led = leds.find(l => l.index === ledIndex);
    if (led && !isLedEnabled(led)) return;

    if (isMultiKey(e)) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(ledIndex)) next.delete(ledIndex);
        else next.add(ledIndex);
        return next;
      });
      return;
    }

    // Parked LEDs drag with free cursor tracking so the user can drop one
    // back in the frame without having to predict where its stale (u,v)
    // ended up. Group drags don't work on parked LEDs - the typical flow
    // is "delete many, drag back one by one" and preserving group semantics
    // would collide with the free-tracking model.
    if (led && led.disabled) {
      pushUndo();
      setSelected(new Set([ledIndex]));
      const { x: cx, y: cy } = getCanvasPercent(e);
      setParkedDrag({ index: ledIndex, cx, cy });
      return;
    }

    if (!selected.has(ledIndex)) {
      setSelected(new Set([ledIndex]));
    }

    pushUndo();
    setDragging(true);
    setDragStart(getCanvasPercent(e));
    setDragDelta(null);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.led) return;
    if ((e.target as HTMLElement).dataset.rectResize) return;
    if ((e.target as HTMLElement).dataset.selectionHandle) return;
    const { x: px, y: py } = getCanvasPercent(e);

    const additive = isMultiKey(e);
    marqueeAdditiveRef.current = additive;
    preMarqueeSelectionRef.current = additive ? new Set(selected) : new Set();

    if (!additive) {
      setSelected(new Set());
    }

    setMarquee({ x1: px, y1: py, x2: px, y2: py });
    setMarqueeActive(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const cursor = getCanvasPercent(e);
    lastPointerRef.current = cursor;
    if (parkedDrag) {
      setParkedDrag({ ...parkedDrag, cx: cursor.x, cy: cursor.y });
      return;
    }

    if (selectionResizing && selectionResizeRef.current) {
      const { anchorU, anchorV, origU, origV, initialLeds } = selectionResizeRef.current;
      const { x: px, y: py } = getCanvasPercent(e);
      const { u: newU, v: newV } = canvasToUv(px, py);
      const origW = origU - anchorU;
      const origH = origV - anchorV;
      const newW = newU - anchorU;
      const newH = newV - anchorV;
      // Avoid divide-by-zero when the selection started as a single LED
      // (origW or origH == 0). Fall back to a no-op in that axis so the
      // other axis still stretches if there's width/height there.
      const sx = Math.abs(origW) > 0.001 ? newW / origW : 1;
      const sy = Math.abs(origH) > 0.001 ? newH / origH : 1;
      setLeds(prev => prev.map(l => {
        const init = initialLeds.get(l.index);
        if (!init) return l;
        const u = Math.max(0, Math.min(1, anchorU + (init.u - anchorU) * sx));
        const v = Math.max(0, Math.min(1, anchorV + (init.v - anchorV) * sy));
        return { ...l, u, v, isCustom: true };
      }));
      return;
    }

    if (rectResizing && rectResizeRef.current) {
      const { x: px, y: py } = getCanvasPercent(e);
      const r = rectResizeRef.current;
      const dx = px - r.startX;
      const dy = py - r.startY;
      const newW = Math.max(15, Math.min(95, r.rect.w + dx));
      const newH = Math.max(15, Math.min(95, r.rect.h + dy));
      setDevRect({ ...r.rect, w: newW, h: newH });
      setRectRatio(newW / newH);
      setDirty(true);
      return;
    }

    if (marqueeActive && marquee) {
      const { x: px, y: py } = getCanvasPercent(e);
      const updated = { ...marquee, x2: px, y2: py };
      setMarquee(updated);
      setSelected(computeMarqueeSelection(updated));
      return;
    }

    if (!dragging || !dragStart) return;
    const { x: px, y: py } = getCanvasPercent(e);
    const dPx = px - dragStart.x;
    const dPy = py - dragStart.y;
    const pad = getPadPercent();
    const innerW = devRect.w - 2 * pad.px;
    const innerH = devRect.h - 2 * pad.py;
    const du = innerW > 0 ? dPx / innerW : 0;
    const dv = innerH > 0 ? dPy / innerH : 0;
    setDragDelta({ du, dv });
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    // Always use the most-recent pointermove cursor as the source of
    // truth for release position. pointerLeave fires without coordinates
    // in some browsers, and even when it does have them they can be
    // outside the canvas viewport; the last-pointermove snapshot is
    // accurate for the in-canvas trajectory we care about.
    const cursor = e ? getCanvasPercent(e) : lastPointerRef.current;

    if (parkedDrag) {
      // Prefer the event's cursor when available; fall back to the last
      // tracked position. parkedDrag already stores the last pointermove
      // cx/cy, but an event-provided release point is more exact.
      const cx = cursor ? cursor.x : parkedDrag.cx;
      const cy = cursor ? cursor.y : parkedDrag.cy;
      const ledIndex = parkedDrag.index;
      setParkedDrag(null);
      if (isInsideFrame(cx, cy)) {
        const { u, v } = canvasToUv(cx, cy);
        setLeds(prev => prev.map(l =>
          l.index === ledIndex
            ? { ...l, disabled: false, u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)), isCustom: true }
            : l,
        ));
        setDirty(true);
      }
      return;
    }

    if (selectionResizing) {
      setSelectionResizing(false);
      selectionResizeRef.current = null;
      setDirty(true);
      return;
    }

    if (rectResizing) {
      setRectResizing(false);
      rectResizeRef.current = null;
      return;
    }

    if (marqueeActive) {
      setMarquee(null);
      setMarqueeActive(false);
      return;
    }

    if (dragging && dragDelta && selected.size > 0) {
      const pastBottom = cursor !== null && cursor.y > devRect.y + devRect.h;
      setLeds(prev => prev.map(led => {
        if (!selected.has(led.index)) return led;
        if (pastBottom) {
          return { ...led, disabled: true, isCustom: true };
        }
        return {
          ...led,
          u: Math.max(0, Math.min(1, led.u + dragDelta.du)),
          v: Math.max(0, Math.min(1, led.v + dragDelta.dv)),
          isCustom: true,
        };
      }));
      setDirty(true);
    }
    setDragging(false);
    setDragStart(null);
    setDragDelta(null);
  };

  const handleSelectionCornerDown = (e: React.PointerEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.preventDefault();
    e.stopPropagation();
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    // Anchor = opposite corner. Dragging NE stretches toward the north-east,
    // keeping the SW corner pinned; LEDs scale relative to that fixed corner.
    const anchorU = corner === 'nw' || corner === 'sw' ? bounds.maxU : bounds.minU;
    const anchorV = corner === 'nw' || corner === 'ne' ? bounds.maxV : bounds.minV;
    const origU = corner === 'nw' || corner === 'sw' ? bounds.minU : bounds.maxU;
    const origV = corner === 'nw' || corner === 'ne' ? bounds.minV : bounds.maxV;
    const initialLeds = new Map<number, { u: number; v: number }>();
    for (const l of leds) {
      if (selected.has(l.index)) initialLeds.set(l.index, { u: l.u, v: l.v });
    }
    selectionResizeRef.current = { corner, anchorU, anchorV, origU, origV, initialLeds };
    setSelectionResizing(true);
  };

  const handleRectResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pushUndo();
    const { x: px, y: py } = getCanvasPercent(e);
    rectResizeRef.current = { startX: px, startY: py, rect: { ...devRect } };
    setRectResizing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const defs = defaultLedsRef.current;
    const overrides: { ledIndex: number; u: number; v: number; disabled?: boolean }[] = [];
    for (const led of leds) {
      // Save when position was customized OR the LED is disabled. A disabled
      // LED without any other custom change must still round-trip so the
      // parked state survives a reload.
      if (!led.isCustom && !led.disabled) continue;
      const def = defs.find(d => d.index === led.index);
      const posUnchanged = def && Math.abs(led.u - def.u) < 0.0001 && Math.abs(led.v - def.v) < 0.0001;
      if (posUnchanged && !led.disabled) continue;
      overrides.push({
        ledIndex: led.index,
        u: led.u,
        v: led.v,
        ...(led.disabled ? { disabled: true } : {}),
      });
    }
    await saveLedMap(deviceId, overrides, rectRatio);
    if (overrides.length === 0 && rectRatio === DEFAULT_RATIO) {
      await resetLedMap(deviceId);
    }
    // Re-snapshot so the dashed "unsaved" rings disappear now that what the
    // user sees matches what the service has persisted.
    const snap = new Map<number, { u: number; v: number; disabled: boolean }>();
    for (const l of leds) snap.set(l.index, { u: l.u, v: l.v, disabled: l.disabled });
    setSavedLedsMap(snap);
    setSaving(false);
    setDirty(false);
  };

  // Editable LED count for resizable motherboard zones. Sends RESIZEZONE to
  // OpenRGB; the service persists the new count in zone.ledCount (mirrored
  // to the device list) and returns a fresh LED map with len == count.
  // Optimistic update is rolled back on API failure so the input can't drift
  // out of sync with the actual device state.
  const handleLedCountCommit = useCallback(async (n: number) => {
    const clamped = Math.max(1, Math.min(300, n));
    if (!canEditLedCount || clamped === liveLedCountRef.current || countChangingRef.current) return;
    const prev = liveLedCountRef.current;
    // Snapshot redo stack before pushUndo clears it so we can restore on failure.
    const savedRedo = redoStackRef.current.map(s => ({ ...s, leds: s.leds.map(l => ({ ...l })) }));
    pushUndo();
    countChangingRef.current = true;
    setLiveLedCount(clamped);
    try {
      await setZoneLedCount(deviceId, clamped);
      await load(true);
    } catch {
      undoStackRef.current.pop();
      setUndoLen(undoStackRef.current.length);
      redoStackRef.current = savedRedo;
      setRedoLen(savedRedo.length);
      setLiveLedCount(prev);
    } finally {
      countChangingRef.current = false;
    }
  }, [canEditLedCount, deviceId, load, pushUndo]);

  const handleReset = () => {
    pushUndo();
    if (defaultLedsRef.current.length > 0) {
      setLeds(defaultLedsRef.current.map(l => ({ ...l, isCustom: true })));
    }
    setRectRatio(DEFAULT_RATIO);
    setDevRect({ x: 10, y: 10, w: 80, h: 80 });
    setDirty(true);
    setSelected(new Set());
  };

  // ── Multi-select group ops ────────────────────────────────────────────
  // All three reshape the selected LEDs in UV space. Sort by LED index so
  // "arrange 0-N in a strip / grid" respects the firmware ordering, which is
  // what users are usually trying to match with the physical hardware.
  const getSelectedSorted = useCallback((): LedMapEntry[] => {
    // Disabled LEDs don't participate in bbox / align / rotate operations -
    // their "position" is the parking slot, not a real (u,v) the user cares
    // about. Restoring them is the one way to bring them back into ops.
    return leds.filter(l => selected.has(l.index) && !l.disabled).sort((a, b) => a.index - b.index);
  }, [leds, selected]);

  const getSelectionUvBounds = useCallback((): { minU: number; maxU: number; minV: number; maxV: number } | null => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length === 0) return null;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const l of sel) {
      if (l.u < minU) minU = l.u;
      if (l.u > maxU) maxU = l.u;
      if (l.v < minV) minV = l.v;
      if (l.v > maxV) maxV = l.v;
    }
    // Pad the bbox outward so align-grid / align-strip have breathing room.
    // The tight bbox of a sparse selection can be microscopic which forces
    // aligned LEDs to pile up on top of each other; a small constant pad
    // gives the operations enough width / height to actually spread out.
    const p = SELECTION_BBOX_PAD_UV;
    return {
      minU: Math.max(0, minU - p),
      maxU: Math.min(1, maxU + p),
      minV: Math.max(0, minV - p),
      maxV: Math.min(1, maxV + p),
    };
  }, [leds, selected]);

  const handleAlignHorizontal = useCallback(() => {
    const sel = getSelectedSorted();
    if (sel.length < 2) return;
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    const midV = (bounds.minV + bounds.maxV) / 2;
    const span = bounds.maxU - bounds.minU;
    const step = sel.length > 1 ? span / (sel.length - 1) : 0;
    const byIndex = new Map<number, { u: number; v: number }>();
    sel.forEach((led, i) => {
      byIndex.set(led.index, { u: bounds.minU + step * i, v: midV });
    });
    setLeds(prev => prev.map(l => {
      const p = byIndex.get(l.index);
      return p ? { ...l, u: p.u, v: p.v, isCustom: true } : l;
    }));
    setDirty(true);
  }, [getSelectedSorted, getSelectionUvBounds, pushUndo]);

  const handleAlignGrid = useCallback(() => {
    const sel = getSelectedSorted();
    if (sel.length < 2) return;
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    const n = sel.length;
    // Prefer wider-than-tall grids since device rects usually are.
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const spanU = bounds.maxU - bounds.minU;
    const spanV = bounds.maxV - bounds.minV;
    const stepU = cols > 1 ? spanU / (cols - 1) : 0;
    const stepV = rows > 1 ? spanV / (rows - 1) : 0;
    const byIndex = new Map<number, { u: number; v: number }>();
    sel.forEach((led, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      byIndex.set(led.index, {
        u: cols > 1 ? bounds.minU + stepU * c : (bounds.minU + bounds.maxU) / 2,
        v: rows > 1 ? bounds.minV + stepV * r : (bounds.minV + bounds.maxV) / 2,
      });
    });
    setLeds(prev => prev.map(l => {
      const p = byIndex.get(l.index);
      return p ? { ...l, u: p.u, v: p.v, isCustom: true } : l;
    }));
    setDirty(true);
  }, [getSelectedSorted, getSelectionUvBounds, pushUndo]);

  const handleDeleteSelected = useCallback(() => {
    if (selected.size === 0) return;
    pushUndo();
    setLeds(prev => prev.map(l =>
      selected.has(l.index) && !l.disabled
        ? { ...l, disabled: true, isCustom: true }
        : l,
    ));
    setDirty(true);
  }, [selected, pushUndo]);

  const handleRestoreSelected = useCallback(() => {
    if (selected.size === 0) return;
    const defs = defaultLedsRef.current;
    pushUndo();
    setLeds(prev => prev.map(l => {
      if (!selected.has(l.index) || !l.disabled) return l;
      // Restore to the default position so the re-enabled LED lands
      // somewhere sensible even if its last custom u,v was nonsense.
      const def = defs.find(d => d.index === l.index);
      return {
        ...l,
        disabled: false,
        u: def ? def.u : l.u,
        v: def ? def.v : l.v,
        isCustom: true,
      };
    }));
    setDirty(true);
  }, [selected, pushUndo]);

  const handleFlipH = useCallback(() => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length < 2) return;
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    const mid = (bounds.minU + bounds.maxU) / 2;
    setLeds(prev => prev.map(l =>
      selected.has(l.index) && !l.disabled
        ? { ...l, u: Math.max(0, Math.min(1, 2 * mid - l.u)), isCustom: true }
        : l,
    ));
    setDirty(true);
  }, [leds, selected, getSelectionUvBounds, pushUndo]);

  const handleFlipV = useCallback(() => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length < 2) return;
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    const mid = (bounds.minV + bounds.maxV) / 2;
    setLeds(prev => prev.map(l =>
      selected.has(l.index) && !l.disabled
        ? { ...l, v: Math.max(0, Math.min(1, 2 * mid - l.v)), isCustom: true }
        : l,
    ));
    setDirty(true);
  }, [leds, selected, getSelectionUvBounds, pushUndo]);

  const handleResetSelected = useCallback(() => {
    if (selected.size === 0) return;
    const defs = defaultLedsRef.current;
    if (defs.length === 0) return;
    pushUndo();
    setLeds(prev => prev.map(l => {
      if (!selected.has(l.index)) return l;
      const def = defs.find(d => d.index === l.index);
      return def ? { ...l, u: def.u, v: def.v, disabled: false, isCustom: true } : l;
    }));
    setDirty(true);
  }, [selected, pushUndo]);

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(leds.filter(l => enabledZones.has(l.zoneType)).map(l => l.index)));
  }, [leds, enabledZones]);

  const handleRestoreAll = useCallback(() => {
    const defs = defaultLedsRef.current;
    pushUndo();
    setLeds(prev => prev.map(l => {
      if (!l.disabled) return l;
      const def = defs.find(d => d.index === l.index);
      return {
        ...l,
        disabled: false,
        u: def ? def.u : l.u,
        v: def ? def.v : l.v,
        isCustom: true,
      };
    }));
    setDirty(true);
  }, [pushUndo]);

  const hasDisabled = useMemo(() => leds.some(l => l.disabled), [leds]);

  // Set of LED indices that differ from the last-saved snapshot. Only these
  // render with the dashed "unsaved change" ring; persisted customisations
  // look normal after Save.
  const unsavedLedSet = useMemo(() => {
    const s = new Set<number>();
    for (const l of leds) {
      const saved = savedLedsMap.get(l.index);
      if (!saved) {
        s.add(l.index);
        continue;
      }
      if (Math.abs(l.u - saved.u) > 0.0001
        || Math.abs(l.v - saved.v) > 0.0001
        || l.disabled !== saved.disabled) {
        s.add(l.index);
      }
    }
    return s;
  }, [leds, savedLedsMap]);

  // Nudge selected LEDs by a small UV step. Shift = coarser step. Only
  // moves LEDs that are currently in the frame; parked LEDs need to be
  // dragged back before they can be nudged.
  const handleNudge = useCallback((du: number, dv: number) => {
    if (selected.size === 0) return;
    pushUndo();
    setLeds(prev => prev.map(l => {
      if (!selected.has(l.index) || l.disabled) return l;
      return {
        ...l,
        u: Math.max(0, Math.min(1, l.u + du)),
        v: Math.max(0, Math.min(1, l.v + dv)),
        isCustom: true,
      };
    }));
    setDirty(true);
  }, [selected, pushUndo]);

  const handleRotate90 = useCallback(() => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length < 2) return;
    pushUndo();
    // Rotate around the selection's UV centroid with aspect correction so the
    // visual rotation on the canvas matches a real 90 degree turn. Aspect
    // factor = device rect's visible width / height (px, taking rectRatio).
    const cu = sel.reduce((s, l) => s + l.u, 0) / sel.length;
    const cv = sel.reduce((s, l) => s + l.v, 0) / sel.length;
    // rectRatio is w/h of the device rect within the canvas.
    const ar = Math.max(0.01, rectRatio);
    const byIndex = new Map<number, { u: number; v: number }>();
    for (const l of sel) {
      const du = l.u - cu;
      const dv = l.v - cv;
      // 90 deg CW in screen coords (y-down): (x, y) -> (-y, x), with aspect
      // conversion between u (scaled by ar) and v.
      const nu = cu - dv / ar;
      const nv = cv + du * ar;
      byIndex.set(l.index, { u: nu, v: nv });
    }
    // Clamp + recenter: if the rotated bbox fell outside [0, 1], shift the
    // whole group so its min corner sits at >= 0 (preserving the rotation).
    let minNu = Infinity, maxNu = -Infinity, minNv = Infinity, maxNv = -Infinity;
    for (const p of byIndex.values()) {
      if (p.u < minNu) minNu = p.u;
      if (p.u > maxNu) maxNu = p.u;
      if (p.v < minNv) minNv = p.v;
      if (p.v > maxNv) maxNv = p.v;
    }
    let shiftU = 0, shiftV = 0;
    if (minNu < 0) shiftU = -minNu;
    else if (maxNu > 1) shiftU = 1 - maxNu;
    if (minNv < 0) shiftV = -minNv;
    else if (maxNv > 1) shiftV = 1 - maxNv;
    if (shiftU !== 0 || shiftV !== 0) {
      for (const [k, p] of byIndex) byIndex.set(k, { u: p.u + shiftU, v: p.v + shiftV });
    }
    setLeds(prev => prev.map(l => {
      const p = byIndex.get(l.index);
      return p
        ? { ...l, u: Math.max(0, Math.min(1, p.u)), v: Math.max(0, Math.min(1, p.v)), isCustom: true }
        : l;
    }));
    setDirty(true);
  }, [leds, selected, rectRatio, pushUndo]);

  // Canvas-space bbox for the floating selection toolbar. Uses the padded
  // UV bbox from getSelectionUvBounds so the visible box matches the area
  // that align-strip / align-grid / rotate will spread the LEDs into.
  const selectionCanvasBounds = useMemo(() => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length < 2) return null;
    const bounds = getSelectionUvBounds();
    if (!bounds) return null;
    const tl = uvToCanvas(bounds.minU, bounds.minV);
    const br = uvToCanvas(bounds.maxU, bounds.maxV);
    return { minX: tl.cx, maxX: br.cx, minY: tl.cy, maxY: br.cy };
  }, [leds, selected, getSelectionUvBounds, uvToCanvas]);

  // Sorted disabled-LED indices so each parked LED has a deterministic slot
  // and the row re-packs when more get deleted / re-enabled.
  const disabledOrder = useMemo(() => {
    return leds.filter(l => l.disabled).map(l => l.index).sort((a, b) => a - b);
  }, [leds]);

  // Show the selection toolbar whenever at least one LED is selected (even
  // a single parked LED gets the trash + restore affordance so group-of-1
  // deletes work). The anchor is the selection bbox when available, else
  // the last LED's canvas position as a fallback.
  const selectionToolbarAnchor = useMemo(() => {
    if (selectionCanvasBounds) return { cx: selectionCanvasBounds.maxX, cy: selectionCanvasBounds.minY };
    if (selected.size === 0) return null;
    const anyLed = leds.find(l => selected.has(l.index));
    if (!anyLed) return null;
    const pos = getLedCanvasPos(anyLed, disabledOrder);
    return { cx: pos.cx + 3, cy: pos.cy - 3 };
  }, [selectionCanvasBounds, selected, leds, disabledOrder, getLedCanvasPos]);

  // Any selected LED that's currently parked -> show the Restore button
  // in the selection toolbar. Any selected LED that's currently enabled ->
  // show the Delete button. Both can appear at once when a mixed selection
  // is active.
  const hasEnabledSelected = useMemo(
    () => leds.some(l => selected.has(l.index) && !l.disabled),
    [leds, selected],
  );
  const hasDisabledSelected = useMemo(
    () => leds.some(l => selected.has(l.index) && l.disabled),
    [leds, selected],
  );

  const hoveredEntry = hoveredLed !== null ? leds.find(l => l.index === hoveredLed) : null;

  // Re-bind shortcut handlers every render so the keydown listener always
  // calls the current closures (which depend on selected / leds / pushUndo
  // identities). Declared here, after every handler useCallback, so all
  // references resolve.
  shortcutHandlersRef.current = {
    selectAll: handleSelectAll,
    deleteSelected: handleDeleteSelected,
    nudge: handleNudge,
    undo: handleUndo,
    redo: handleRedo,
  };
  selectedSizeRef.current = selected.size;

  const getLedPosition = (led: LedMapEntry) => {
    const dragOverride = dragging && dragDelta ? dragDelta : undefined;
    return getLedCanvasPos(led, disabledOrder, dragOverride);
  };

  const modes: { key: EditorMode; label: string }[] = [
    { key: 'animation', label: t('lighting.ledMap.modeAnim') },
    { key: 'horizontal', label: t('lighting.ledMap.testH') },
    { key: 'vertical', label: t('lighting.ledMap.testV') },
    { key: 'none', label: t('lighting.ledMap.modeNone') },
  ];

  return (
    <DeviceModal open onClose={handleClose} title={`${deviceName} - ${t('lighting.ledMap.title')}`} wide>
      {loading ? (
        <div className={styles.loading}>{t('lighting.ledMap.title')}...</div>
      ) : (
        <div className={styles.content}>
          <div className={styles.toolbar}>
            <div className={styles.modeBtns}>
              <span className={styles.modeBtnsLabel}>{t('lighting.ledMap.testSection')}</span>
              {modes.map(m => (
                <button
                  key={m.key}
                  type="button"
                  className={`${styles.modeBtn} ${editorMode === m.key ? styles.modeBtnActive : ''}`}
                  onClick={() => setEditorMode(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {zoneTypes.length > 1 && (
              <>
                <div className={styles.separator} />
                <div className={styles.zoneBtns}>
                  {zoneTypes.map(z => (
                    <button
                      key={z}
                      type="button"
                      className={`${styles.zoneBtn} ${enabledZones.has(z) ? styles.zoneBtnActive : ''}`}
                      onClick={() => toggleZone(z)}
                    >
                      <span className={`${styles.legendDot} ${z === 'matrix' ? styles.legendDotMatrix : z === 'linear' ? styles.legendDotLinear : styles.legendDotSingle}`} />
                      {zoneLabel(z)}
                    </button>
                  ))}
                </div>
              </>
            )}
            {canEditLedCount && (
              <>
                <div className={styles.separator} />
                <label className={styles.ledCountField}>
                  <span className={styles.ledCountLabel}>{t('lighting.ledMap.ledCount')}</span>
                  <input
                    type="number"
                    className={styles.ledCountInput}
                    value={ledCountDraft}
                    min={1}
                    max={300}
                    aria-label={t('lighting.ledMap.ledCount')}
                    onChange={e => setLedCountDraft(e.target.value)}
                    onBlur={e => {
                      if (ledCountEscapeRef.current) { ledCountEscapeRef.current = false; return; }
                      if (countChangingRef.current) { setLedCountDraft(String(liveLedCountRef.current)); return; }
                      const n = parseInt(e.currentTarget.value, 10);
                      if (isNaN(n)) { setLedCountDraft(String(liveLedCountRef.current)); return; }
                      handleLedCountCommit(n);
                    }}
                    onKeyDown={e => {
                      e.stopPropagation();
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') {
                        ledCountEscapeRef.current = true;
                        setLedCountDraft(String(liveLedCountRef.current));
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                  />
                </label>
              </>
            )}
            <div className={styles.separator} />
            <div className={styles.brightnessField}>
              {brightness === 0
                ? <SunDim size={14} strokeWidth={1.7} className={styles.brightnessIcon} aria-hidden />
                : <Sun size={14} strokeWidth={1.7} className={styles.brightnessIcon} aria-hidden />}
              <Slider
                value={brightness}
                min={0}
                max={100}
                step={1}
                orientation="bare"
                onChange={handleBrightnessChange}
                onCommit={handleBrightnessCommit}
                trackFill
                ariaLabel={t('lighting.devices.brightness')}
                className={styles.brightnessTrack}
              />
              <span className={styles.brightnessValue}>{brightness}%</span>
            </div>
            <div className={styles.spacer} />
            <HoverTooltip body={`${t('lighting.ledMap.selectAll')} (${isMac ? 'Cmd' : 'Ctrl'}+A)`} side="bottom">
              <button
                type="button"
                className={styles.iconBtn}
                onClick={handleSelectAll}
                aria-label={t('lighting.ledMap.selectAll')}
              >
                <CheckSquare size={15} />
              </button>
            </HoverTooltip>
            <HoverTooltip body={`${t('lighting.ledMap.selectNone')} (Esc)`} side="bottom">
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setSelected(new Set())}
                disabled={selected.size === 0}
                aria-label={t('lighting.ledMap.selectNone')}
              >
                <Square size={15} />
              </button>
            </HoverTooltip>
            {hasDisabled && (
              <HoverTooltip body={t('lighting.ledMap.restoreAll')} side="bottom">
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={handleRestoreAll}
                  aria-label={t('lighting.ledMap.restoreAll')}
                >
                  <RotateCcw size={15} />
                </button>
              </HoverTooltip>
            )}
            <div className={styles.separator} />
            <HoverTooltip body={`${t('lighting.ledMap.undo')} (${isMac ? 'Cmd' : 'Ctrl'}+Z)`} side="bottom">
              <button type="button" className={styles.iconBtn} onClick={handleUndo} disabled={undoLen === 0} aria-label={t('lighting.ledMap.undo')}>
                <Undo2 size={15} />
              </button>
            </HoverTooltip>
            <HoverTooltip body={`${t('lighting.ledMap.redo')} (${isMac ? 'Cmd' : 'Ctrl'}+Shift+Z)`} side="bottom">
              <button type="button" className={styles.iconBtn} onClick={handleRedo} disabled={redoLen === 0} aria-label={t('lighting.ledMap.redo')}>
                <Redo2 size={15} />
              </button>
            </HoverTooltip>
            <button type="button" className={styles.btn} onClick={handleReset}>
              {t('lighting.ledMap.reset')}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              {t('lighting.ledMap.save')}
            </button>
          </div>

          <div className={styles.hint}>
            {leds.length} LEDs - {t('lighting.ledMap.dragHint')} - {isMac ? 'Cmd' : 'Ctrl'}+{t('lighting.ledMap.clickMulti')} - {t('lighting.ledMap.deleteHint')}
          </div>

          <div
            ref={canvasRef}
            className={styles.canvas}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={e => handlePointerUp(e)}
            onPointerLeave={() => handlePointerUp()}
          >
            <div
              className={styles.deviceRect}
              style={{
                left: `${devRect.x}%`,
                top: `${devRect.y}%`,
                width: `${devRect.w}%`,
                height: `${devRect.h}%`,
              }}
            >
              <div
                data-rect-resize="1"
                className={styles.rectResize}
                onPointerDown={handleRectResizeDown}
              />
            </div>

            {/* Parking-row separator so the boundary between "live" LEDs and
                deleted ones is obvious. A subtle line across the canvas just
                below the device frame. */}
            {hasDisabled && (
              <div
                className={styles.parkSeparator}
                style={{ top: `${devRect.y + devRect.h}%` }}
              />
            )}

            {leds.map(led => {
              const { cx, cy } = getLedPosition(led);
              const isSelected = selected.has(led.index);
              const enabled = isLedEnabled(led);
              const beingParkedDragged = parkedDrag?.index === led.index;
              return (
                <div
                  key={led.index}
                  data-led="1"
                  className={[
                    styles.led,
                    led.zoneType === 'matrix' ? styles.ledMatrix
                      : led.zoneType === 'linear' ? styles.ledLinear
                      : styles.ledSingle,
                    unsavedLedSet.has(led.index) ? styles.ledCustom : '',
                    isSelected ? styles.ledSelected : '',
                    (dragging && isSelected) || beingParkedDragged ? styles.ledDragging : '',
                    led.disabled ? styles.ledParked : '',
                    !enabled ? styles.ledDisabled : '',
                  ].filter(Boolean).join(' ')}
                  style={{ left: `${cx}%`, top: `${cy}%` }}
                  onPointerDown={e => handleLedPointerDown(e, led.index)}
                  onPointerEnter={() => setHoveredLed(led.index)}
                  onPointerLeave={() => setHoveredLed(null)}
                >
                  <span className={styles.ledIndex} aria-hidden>{led.index + 1}</span>
                </div>
              );
            })}

            {selectionCanvasBounds && (
              /* Selection bbox outline + 4 corner resize handles. Dragging a
                 handle proportionally stretches every selected LED toward
                 the opposite (anchored) corner. Only shown for multi-LED
                 in-frame selections where stretching makes sense. */
              <div
                className={styles.selectionBox}
                style={{
                  left: `${selectionCanvasBounds.minX}%`,
                  top: `${selectionCanvasBounds.minY}%`,
                  width: `${selectionCanvasBounds.maxX - selectionCanvasBounds.minX}%`,
                  height: `${selectionCanvasBounds.maxY - selectionCanvasBounds.minY}%`,
                }}
              >
                {(['nw', 'ne', 'sw', 'se'] as const).map(c => (
                  <div
                    key={c}
                    data-selection-handle="1"
                    className={`${styles.selectionHandle} ${SELECTION_HANDLE_CLASS[c]}`}
                    onPointerDown={e => handleSelectionCornerDown(e, c)}
                  />
                ))}
              </div>
            )}
            {selectionToolbarAnchor && (
              <div
                className={styles.selectionToolbar}
                style={{
                  left: `${selectionToolbarAnchor.cx}%`,
                  top: `${selectionToolbarAnchor.cy}%`,
                }}
                onPointerDown={e => e.stopPropagation()}
              >
                {selectionCanvasBounds && (
                  <>
                    <HoverTooltip body={t('lighting.ledMap.alignHorizontal')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleAlignHorizontal}
                        aria-label={t('lighting.ledMap.alignHorizontal')}
                      >
                        <AlignHorizontalDistributeCenter size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.alignGrid')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleAlignGrid}
                        aria-label={t('lighting.ledMap.alignGrid')}
                      >
                        <Grid3x3 size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.rotate90')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleRotate90}
                        aria-label={t('lighting.ledMap.rotate90')}
                      >
                        <RotateCw size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.flipH')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleFlipH}
                        aria-label={t('lighting.ledMap.flipH')}
                      >
                        <FlipHorizontal2 size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.flipV')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleFlipV}
                        aria-label={t('lighting.ledMap.flipV')}
                      >
                        <FlipVertical2 size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.resetSelected')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleResetSelected}
                        aria-label={t('lighting.ledMap.resetSelected')}
                      >
                        <RotateCcw size={14} />
                      </button>
                    </HoverTooltip>
                    <div className={styles.selectionBtnSeparator} />
                  </>
                )}
                {hasEnabledSelected && (
                  <HoverTooltip body={`${t('lighting.ledMap.delete')} (Del)`} side="top">
                    <button
                      type="button"
                      className={`${styles.selectionBtn} ${styles.selectionBtnDanger}`}
                      onClick={handleDeleteSelected}
                      aria-label={t('lighting.ledMap.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </HoverTooltip>
                )}
                {hasDisabledSelected && (
                  <HoverTooltip body={t('lighting.ledMap.restore')} side="top">
                    <button
                      type="button"
                      className={styles.selectionBtn}
                      onClick={handleRestoreSelected}
                      aria-label={t('lighting.ledMap.restore')}
                    >
                      <RotateCcw size={14} />
                    </button>
                  </HoverTooltip>
                )}
              </div>
            )}

            {/* Sweep line overlay - visual indicator synced to the hardware pattern */}
            {(editorMode === 'horizontal' || editorMode === 'vertical') && selected.size === 0 && sweepPhase > 0 && (() => {
              const pad = canvasRef.current ? {
                px: (RECT_PAD_PX / canvasRef.current.getBoundingClientRect().width) * 100,
                py: (RECT_PAD_PX / canvasRef.current.getBoundingClientRect().height) * 100,
              } : { px: 0, py: 0 };
              const innerX = devRect.x + pad.px;
              const innerY = devRect.y + pad.py;
              const innerW = devRect.w - 2 * pad.px;
              const innerH = devRect.h - 2 * pad.py;

              if (editorMode === 'horizontal') {
                const x = innerX + sweepPhase * innerW;
                return <div className={styles.sweepLine} style={{ left: `${x}%`, top: `${innerY}%`, width: '2px', height: `${innerH}%` }} />;
              }
              if (editorMode === 'vertical') {
                const y = innerY + sweepPhase * innerH;
                return <div className={styles.sweepLine} style={{ left: `${innerX}%`, top: `${y}%`, width: `${innerW}%`, height: '2px' }} />;
              }
              return null;
            })()}

            {marquee && (
              <div
                className={styles.marquee}
                style={{
                  left: `${Math.min(marquee.x1, marquee.x2)}%`,
                  top: `${Math.min(marquee.y1, marquee.y2)}%`,
                  width: `${Math.abs(marquee.x2 - marquee.x1)}%`,
                  height: `${Math.abs(marquee.y2 - marquee.y1)}%`,
                }}
              />
            )}

            {hoveredEntry && !dragging && !parkedDrag && (() => {
              const { cx, cy } = getLedPosition(hoveredEntry);
              return (
                <div
                  className={styles.tooltip}
                  style={{ left: `${cx}%`, top: `${cy}%` }}
                >
                  {hoveredEntry.name} #{hoveredEntry.index + 1}
                  {hoveredEntry.disabled && (
                    <span className={styles.tooltipMeta}> - {t('lighting.ledMap.parkedTooltip')}</span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
      <ConfirmModal
        open={showUnsavedConfirm}
        title={t('lighting.ledMap.unsavedTitle')}
        message={t('lighting.ledMap.unsavedMessage')}
        confirmLabel={t('lighting.ledMap.discard')}
        cancelLabel={t('lighting.ledMap.keepEditing')}
        destructive
        onConfirm={handleDiscardAndClose}
        onCancel={() => setShowUnsavedConfirm(false)}
      />
    </DeviceModal>
  );
}

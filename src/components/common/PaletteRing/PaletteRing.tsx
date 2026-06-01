import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MAX_COLORIZE } from "../../../types/lightingTemplates";
import styles from "./PaletteRing.module.scss";

/**
 * Radial hue + palette-width picker. A rainbow donut with an arc marking
 * the hues the shader samples; the unselected sector is dimmed. Dragging
 * a handle resizes the arc (colorize); dragging the arc body rotates it
 * (hue). Snapping is symmetric at both ends of the colorize range: the
 * handles merge into a single circle at mono (arc collapsed) and at full
 * rainbow (arc wraps). The merged circle exposes split tabs to pull apart.
 */
export interface PaletteRingProps {
  hue: number;
  colorize: number;
  onChange: (hue: number, colorize: number, commit: boolean) => void;
  onCommit: () => void;
}

const SIZE = 200;
const CX = SIZE / 2;
const CY = SIZE / 2;
// Ring geometry (SVG-space units). Rainbow, dim, and handles all render
// through this in the <svg> below.
const R_OUTER = 90;
const R_INNER = 72;
const R_HANDLE = (R_OUTER + R_INNER) / 2;
// Handle radius matches the native range-slider thumb used elsewhere
// (input[type="range"]::-webkit-slider-thumb in styles/global.scss).
const HANDLE_R = 14;
const TAB_R = 7;
const TAB_OFFSET = HANDLE_R + TAB_R;
const MIN_SPAN = 0;
const MAX_SPAN = 360;
const SNAP_SPAN = 30;
const UNSNAP_SPAN = 40;
const SNAP_EPS = 0.0001;

function hueToAngle(hue: number): number {
  return hue * 360 - 90;
}
function angleToHue(angleDeg: number): number {
  let h = (angleDeg + 90) / 360;
  h = ((h % 1) + 1) % 1;
  return h;
}

function colorizeToSpan(colorize: number): number {
  const c = Math.max(0, Math.min(MAX_COLORIZE, colorize));
  const t = c / MAX_COLORIZE;
  return MAX_SPAN - t * (MAX_SPAN - MIN_SPAN);
}
function spanToColorize(span: number): number {
  const s = Math.max(MIN_SPAN, Math.min(MAX_SPAN, span));
  const t = (MAX_SPAN - s) / (MAX_SPAN - MIN_SPAN);
  return t * MAX_COLORIZE;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function normalizeAngleDelta(deg: number): number {
  let d = deg;
  while (d <= -180) d += 360;
  while (d > 180) d -= 360;
  return d;
}

function donutArcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  spanDeg: number,
): string {
  if (spanDeg <= 0) return "";
  if (spanDeg >= 360) {
    const outerR = polar(cx, cy, rOuter, 0);
    const outerL = polar(cx, cy, rOuter, 180);
    const innerR = polar(cx, cy, rInner, 0);
    const innerL = polar(cx, cy, rInner, 180);
    return [
      `M ${outerR.x} ${outerR.y}`,
      `A ${rOuter} ${rOuter} 0 0 1 ${outerL.x} ${outerL.y}`,
      `A ${rOuter} ${rOuter} 0 0 1 ${outerR.x} ${outerR.y}`,
      `Z`,
      `M ${innerR.x} ${innerR.y}`,
      `A ${rInner} ${rInner} 0 0 0 ${innerL.x} ${innerL.y}`,
      `A ${rInner} ${rInner} 0 0 0 ${innerR.x} ${innerR.y}`,
      `Z`,
    ].join(" ");
  }
  const endDeg = startDeg + spanDeg;
  const largeArc = spanDeg > 180 ? 1 : 0;
  const p1 = polar(cx, cy, rOuter, startDeg);
  const p2 = polar(cx, cy, rOuter, endDeg);
  const p3 = polar(cx, cy, rInner, endDeg);
  const p4 = polar(cx, cy, rInner, startDeg);
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    `Z`,
  ].join(" ");
}

// Saturation / lightness tuned per hue so the spectrum reads evenly;
// yellow and cyan need different levels than red and blue.
const RAINBOW_STOPS: ReadonlyArray<{ deg: number; s: number; l: number }> = [
  { deg: 0, s: 80, l: 55 },
  { deg: 60, s: 85, l: 55 },
  { deg: 120, s: 70, l: 50 },
  { deg: 180, s: 75, l: 50 },
  { deg: 240, s: 75, l: 58 },
  { deg: 300, s: 80, l: 55 },
  { deg: 360, s: 80, l: 55 },
];

function rainbowColorAt(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  for (let i = 0; i < RAINBOW_STOPS.length - 1; i++) {
    const a = RAINBOW_STOPS[i];
    const b = RAINBOW_STOPS[i + 1];
    if (d >= a.deg && d <= b.deg) {
      const t = (d - a.deg) / (b.deg - a.deg);
      const s = a.s + (b.s - a.s) * t;
      const l = a.l + (b.l - a.l) * t;
      return `hsl(${d}, ${s}%, ${l}%)`;
    }
  }
  return `hsl(${d}, 80%, 55%)`;
}

// Rainbow donut as overlapping SVG arcs - keeping every element in one
// coordinate system avoids CSS-vs-SVG subpixel drift at non-integer zoom.
// Small overlap hides antialiasing seams between adjacent fills.
const RAINBOW_SEGMENTS = 120;
const RAINBOW_OVERLAP = 0.6;
const RAINBOW_PATHS: ReadonlyArray<{ d: string; color: string }> = (() => {
  const spanPerSegment = 360 / RAINBOW_SEGMENTS;
  const out: Array<{ d: string; color: string }> = [];
  for (let i = 0; i < RAINBOW_SEGMENTS; i++) {
    const hueMid = (i + 0.5) * spanPerSegment;
    const svgStart = i * spanPerSegment - 90 - RAINBOW_OVERLAP / 2;
    const span = spanPerSegment + RAINBOW_OVERLAP;
    const d = donutArcPath(CX, CY, R_OUTER, R_INNER, svgStart, span);
    out.push({ d, color: rainbowColorAt(hueMid) });
  }
  return out;
})();

export function PaletteRing({
  hue,
  colorize,
  onChange,
  onCommit,
}: PaletteRingProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [snapHint, setSnapHint] = useState(false);

  const centerDeg = hueToAngle(hue);
  const spanDeg = colorizeToSpan(colorize);
  const startDeg = centerDeg - spanDeg / 2;
  const endDeg = centerDeg + spanDeg / 2;

  // Both ends of the colorize range render as a merged circle: mono
  // (closed) and full rainbow (start / end wrap to the same angle).
  const snappedClosed = spanDeg <= SNAP_EPS;
  const snappedFull = spanDeg >= MAX_SPAN - SNAP_EPS;
  const snapped = snappedClosed || snappedFull;

  // Dim covers the unselected slice of the ring only (inner to outer) -
  // like an Apple Watch activity-ring trail behind the active arc.
  const dimSpan = MAX_SPAN - spanDeg;
  const dimPath =
    dimSpan > 0 ? donutArcPath(CX, CY, R_OUTER, R_INNER, endDeg, dimSpan) : "";

  const startHandle = polar(CX, CY, R_HANDLE, startDeg);
  const endHandle = polar(CX, CY, R_HANDLE, endDeg);

  // Visible merge point. At full rainbow we render on the opposite side
  // of centerDeg so a body drag rotates consistently with the pie-slice
  // orientation.
  const mergeDeg = snappedFull ? centerDeg + 180 : centerDeg;
  const mergeHandle = polar(CX, CY, R_HANDLE, mergeDeg);

  // Tangent direction at the merge point (for split-tab positions).
  const mergeRad = (mergeDeg * Math.PI) / 180;
  const tangentX = -Math.sin(mergeRad);
  const tangentY = Math.cos(mergeRad);
  const startTab = {
    x: mergeHandle.x - TAB_OFFSET * tangentX,
    y: mergeHandle.y - TAB_OFFSET * tangentY,
  };
  const endTab = {
    x: mergeHandle.x + TAB_OFFSET * tangentX,
    y: mergeHandle.y + TAB_OFFSET * tangentY,
  };

  const cursorAngle = useCallback(
    (clientX: number, clientY: number): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rad = Math.atan2(clientY - cy, clientX - cx);
      return (rad * 180) / Math.PI;
    },
    [],
  );

  const beginDrag = (
    zone: "start" | "end" | "body",
    e: ReactPointerEvent<SVGElement>,
    forceSeparated = false,
  ) => {
    e.stopPropagation();
    const initialCursor = cursorAngle(e.clientX, e.clientY);
    if (initialCursor === null) return;
    const initialHue = hue;
    const initialColorize = colorize;
    const initialCenter = hueToAngle(initialHue);
    const initialSpan = colorizeToSpan(initialColorize);
    const initialStart = initialCenter - initialSpan / 2;
    const initialEnd = initialCenter + initialSpan / 2;
    // For drag-path selection: forceSeparated makes a tab behave like a
    // handle drag even when the arc was at a merged snap.
    const startedSnappedClosed = initialSpan <= SNAP_EPS && !forceSeparated;
    const startedSnappedFull =
      initialSpan >= MAX_SPAN - SNAP_EPS && !forceSeparated;
    const startedSnapped = startedSnappedClosed || startedSnappedFull;
    // For click-to-open: any pointerdown on a tab at a merged position is
    // eligible, regardless of forceSeparated.
    const mergedAtDown =
      initialSpan <= SNAP_EPS || initialSpan >= MAX_SPAN - SNAP_EPS;
    const startedAtFull = initialSpan >= MAX_SPAN - SNAP_EPS;

    // Accumulate unwrapped delta across moves so long drags don't invert
    // sign when the cursor crosses the wrap boundary (and so the arc can pull
    // from mono to full in one continuous drag).
    let lastCursor = initialCursor;
    let delta = 0;

    const move = (ev: PointerEvent) => {
      const curr = cursorAngle(ev.clientX, ev.clientY);
      if (curr === null) return;
      const step = normalizeAngleDelta(curr - lastCursor);
      delta += step;
      lastCursor = curr;

      if (zone === "body") {
        onChange(angleToHue(initialCenter + delta), initialColorize, false);
        return;
      }

      // Drag from a merged state. Magnitude is how far the user pulled:
      // from snapped-closed that magnitude becomes the new arc span; from
      // snapped-full it becomes the new GAP span (arc = MAX_SPAN - pulled).
      // The arc centre stays anchored so the opening (gap at full, arc at
      // closed) always forms around the click point, not the opposite side.
      if (startedSnapped) {
        const magnitude = Math.abs(delta);
        if (magnitude < UNSNAP_SPAN) {
          setSnapHint(magnitude > SNAP_SPAN * 0.4);
          onChange(angleToHue(initialCenter + delta), initialColorize, false);
          return;
        }
        setSnapHint(false);
        const pulled = Math.min(magnitude, MAX_SPAN);
        const newSpan = startedSnappedFull ? MAX_SPAN - pulled : pulled;
        const newCenter = initialCenter + delta / 2;
        onChange(angleToHue(newCenter), spanToColorize(newSpan), false);
        return;
      }

      // Non-snapped handle drag. Compute raw new span from the anchor;
      // clamp / snap at both ends of the range.
      let rawSpan: number;
      let anchor: number;
      if (zone === "start") {
        const newStart = initialStart + delta;
        rawSpan = initialEnd - newStart;
        anchor = initialEnd;
      } else {
        const newEnd = initialEnd + delta;
        rawSpan = newEnd - initialStart;
        anchor = initialStart;
      }

      let newSpan = rawSpan;
      let hint = false;
      if (newSpan > MAX_SPAN) newSpan = MAX_SPAN;
      if (newSpan < 0) newSpan = 0;
      if (newSpan < SNAP_SPAN) {
        hint = newSpan > 0;
        newSpan = 0;
      } else if (newSpan > MAX_SPAN - SNAP_SPAN) {
        hint = newSpan < MAX_SPAN;
        newSpan = MAX_SPAN;
      }
      setSnapHint(hint);
      const newCenter =
        zone === "start" ? anchor - newSpan / 2 : anchor + newSpan / 2;
      onChange(angleToHue(newCenter), spanToColorize(newSpan), false);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setSnapHint(false);

      // Click-to-open: a tap on a tab at a merged position pops the
      // handles barely apart. Same magnitude either way - arc grows from
      // closed, gap grows from full - centred at the click point.
      const totalMag = Math.abs(delta);
      const wasClick = totalMag < 5;
      if (wasClick && zone !== "body" && mergedAtDown) {
        const openGap = SNAP_SPAN * 1.5;
        const newSpan = startedAtFull ? MAX_SPAN - openGap : openGap;
        onChange(angleToHue(initialCenter), spanToColorize(newSpan), true);
      }
      onCommit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className={styles.wrap} style={{ width: SIZE, height: SIZE }}>
      <svg
        ref={svgRef}
        className={styles.overlay}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="group"
        aria-label="Palette"
      >
        <g className={styles.rainbow} aria-hidden="true" pointerEvents="none">
          {RAINBOW_PATHS.map((p, i) => (
            <path key={i} d={p.d} fill={p.color} />
          ))}
        </g>
        <path
          d={donutArcPath(CX, CY, R_OUTER + 2, R_INNER - 2, 0, 360)}
          className={styles.bodyZone}
          onPointerDown={(e) => beginDrag("body", e)}
        />
        {dimPath && (
          <path d={dimPath} className={styles.dim} pointerEvents="none" />
        )}
        {snapped ? (
          <g className={styles.snappedGroup}>
            <circle
              cx={mergeHandle.x}
              cy={mergeHandle.y}
              r={HANDLE_R}
              className={`${styles.handle} ${snapHint ? styles.handleHint : ""}`}
              onPointerDown={(e) => beginDrag("body", e)}
              role="slider"
              aria-label="Palette centre"
              aria-valuenow={Math.round((((mergeDeg + 90) % 360) + 360) % 360)}
              aria-valuemin={0}
              aria-valuemax={360}
            />
            {/* Tabs force-separate only from snapped-closed. From
                snapped-full they use the startedSnappedFull drag path
                that shrinks the arc via a natural gap. */}
            <circle
              cx={startTab.x}
              cy={startTab.y}
              r={TAB_R}
              className={styles.splitTab}
              onPointerDown={(e) => beginDrag("start", e, snappedClosed)}
              aria-label="Pull palette start"
            />
            <circle
              cx={endTab.x}
              cy={endTab.y}
              r={TAB_R}
              className={styles.splitTab}
              onPointerDown={(e) => beginDrag("end", e, snappedClosed)}
              aria-label="Pull palette end"
            />
          </g>
        ) : (
          <>
            <circle
              cx={startHandle.x}
              cy={startHandle.y}
              r={HANDLE_R}
              className={`${styles.handle} ${snapHint ? styles.handleHint : ""}`}
              onPointerDown={(e) => beginDrag("start", e)}
              role="slider"
              aria-label="Palette range start"
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round((((startDeg + 90) % 360) + 360) % 360)}
            />
            <circle
              cx={endHandle.x}
              cy={endHandle.y}
              r={HANDLE_R}
              className={`${styles.handle} ${snapHint ? styles.handleHint : ""}`}
              onPointerDown={(e) => beginDrag("end", e)}
              role="slider"
              aria-label="Palette range end"
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round((((endDeg + 90) % 360) + 360) % 360)}
            />
          </>
        )}
      </svg>
    </div>
  );
}

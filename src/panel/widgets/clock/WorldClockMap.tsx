import { useMemo } from 'react';
import type { City } from './cities';
import {
  isDaylight,
  solarDeclination,
  subsolarLongitude,
  terminatorLatAt,
} from './solar';
import { WORLD_GRID } from './worldGridData';
import styles from './WorldClockMap.module.scss';

/**
 * Day/night world-clock map. Land is a field of small squares (one per land
 * cell of the rasterised Natural Earth grid in `worldGridData.ts`) rather than
 * a coastline - the pixelated look. Equirectangular projection; viewBox
 * `-180 -90 360 180` so lon/lat map directly with y flipped:
 *
 *   x = lon         (degrees east, -180..180)
 *   y = -lat        (south-positive SVG y)
 *
 * Land squares carry crisp per-cell day/night fill (two partitioned paths, so
 * the dynamic layer is two DOM nodes, not thousands). Selected cities project
 * through the same identity transform as an accent square on their grid cell.
 */
interface WorldClockMapProps {
  now: Date;
  cities: readonly City[];
  // IANA tz of the user's "Local" entry. A matching city's pin is
  // highlighted; no effect when no city in the list matches.
  highlightTz?: string;
}

const VIEWBOX = '-180 -90 360 180';
const LON_STEP = 4; // terminator polyline resolution (degrees)
const CELL = WORLD_GRID.cellDeg;
const GAP = CELL * 0.16; // inter-square gap, in viewBox units

const clampCell = (i: number, n: number) => Math.max(0, Math.min(n - 1, i));

// City-label metrics, in viewBox units. CHAR_W approximates glyph advance as a
// fraction of font size; TIME_LEN is the "HH:MM" prefix length.
const NAME_FS = 6;
const CHAR_W = 0.58;
const TIME_LEN = 5;
const LABEL_GAP_Y = 1.4;

interface CityLayout {
  lon0: number; latTop: number; cLat: number; tx: number; anchorRight: boolean; dy: number;
}

// Static square geometry per land cell, plus the cell-centre lat/lon used to
// decide day vs night. Built once - only the day/night partition is per-tick.
interface LandCell { x: number; y: number; s: number; lat: number; lon: number; }

function buildLandCells(): LandCell[] {
  const { cellDeg, land } = WORLD_GRID;
  const s = cellDeg - GAP;
  const cells: LandCell[] = [];
  for (let r = 0; r < land.length; r++) {
    const row = land[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '1') continue;
      const lon = -180 + c * cellDeg;
      const latTop = 90 - r * cellDeg;
      cells.push({
        x: lon + GAP / 2,
        y: -latTop + GAP / 2,
        s,
        lat: latTop - cellDeg / 2,
        lon: lon + cellDeg / 2,
      });
    }
  }
  return cells;
}

function squaresPath(cells: readonly LandCell[]): string {
  let d = '';
  for (const c of cells) {
    d += `M${c.x.toFixed(2)},${c.y.toFixed(2)}h${c.s.toFixed(2)}v${c.s.toFixed(2)}h-${c.s.toFixed(2)}z`;
  }
  return d;
}

export function WorldClockMap({ now, cities, highlightTz }: WorldClockMapProps) {
  const declination = solarDeclination(now);
  const subLon = subsolarLongitude(now);

  const landCells = useMemo(() => buildLandCells(), []);

  // Partition land into lit / unlit and emit one path each: the only part of
  // the square field that changes as the terminator moves.
  const { dayPath, nightPath: nightLandPath } = useMemo(() => {
    const day: LandCell[] = [];
    const night: LandCell[] = [];
    for (const cell of landCells) {
      (isDaylight(cell.lat, cell.lon, now) ? day : night).push(cell);
    }
    return { dayPath: squaresPath(day), nightPath: squaresPath(night) };
  }, [landCells, now]);

  const terminatorPath = useMemo(() => {
    const pts: string[] = [];
    for (let lon = -180; lon <= 180; lon += LON_STEP) {
      const lat = terminatorLatAt(lon, subLon, declination);
      pts.push(`${lon.toFixed(2)},${(-lat).toFixed(2)}`);
    }
    return `M ${pts.join(' L ')}`;
  }, [subLon, declination]);

  // Snap each city to its grid cell, then push its single-line label straight
  // down until it clears every already-placed label (greedy, north-first) - so
  // labels of nearby cities stack instead of overlapping. Geometry only; it
  // depends on the selection, not the clock tick.
  const cityLayout = useMemo(() => {
    const placed: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
    const out = new Map<string, CityLayout>();
    for (const city of [...cities].sort((a, b) => b.lat - a.lat)) {
      const col = clampCell(Math.floor((city.lon + 180) / CELL), WORLD_GRID.cols);
      const row = clampCell(Math.floor((90 - city.lat) / CELL), WORLD_GRID.rows);
      const lon0 = -180 + col * CELL;
      const latTop = 90 - row * CELL;
      const cLat = latTop - CELL / 2;
      const anchorRight = lon0 + CELL / 2 > 120;
      const tx = lon0 + CELL / 2 + (anchorRight ? -3 : 3);
      const w = (TIME_LEN + 1 + city.name.length) * NAME_FS * CHAR_W;
      const x0 = anchorRight ? tx - w : tx;
      const x1 = anchorRight ? tx : tx + w;
      const top0 = -cLat - 4; // single line, baseline at -cLat + 2
      const bottom0 = -cLat + 4;
      let dy = 0;
      let box = { x0, x1, y0: top0, y1: bottom0 };
      for (let guard = 0; guard < 80; guard++) {
        box = { x0, x1, y0: top0 + dy, y1: bottom0 + dy };
        const hit = placed.filter(p => p.x0 < box.x1 && box.x0 < p.x1 && p.y0 < box.y1 && box.y0 < p.y1);
        if (hit.length === 0) break;
        dy = Math.max(...hit.map(p => p.y1)) + LABEL_GAP_Y - top0;
      }
      placed.push(box);
      out.set(city.id, { lon0, latTop, cLat, tx, anchorRight, dy });
    }
    return out;
  }, [cities]);

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={VIEWBOX}
        // Uniform scale into the container (no continent stretch);
        // wrap is 2:1 so there's no letterboxing.
        preserveAspectRatio="xMidYMid meet"
        className={styles.svg}
        aria-label="World map showing day and night"
      >
        {/* Land - lit / unlit square fields, text colour at two alphas.
            No ocean rect: the unfilled SVG shows the container's surface. */}
        <path d={dayPath} className={styles.landDay} />
        <path d={nightLandPath} className={styles.landNight} />

        {/* Day/night boundary line */}
        <path d={terminatorPath} className={styles.terminator} />

        {/* Cities: an accent square on the city's grid cell (same size/position
            as a land square), plus a single-line "time city" label that the
            layout pass has pushed clear of its neighbours. */}
        {cities.map(city => {
          const lyt = cityLayout.get(city.id);
          if (!lyt) return null;
          const isLocal = highlightTz !== undefined && city.tz === highlightTz;
          const textAnchor = lyt.anchorRight ? 'end' : 'start';
          return (
            <g key={city.id}>
              <rect
                x={lyt.lon0 + GAP / 2}
                y={-lyt.latTop + GAP / 2}
                width={CELL - GAP}
                height={CELL - GAP}
                className={isLocal ? styles.cityMarkerLocal : styles.cityMarker}
              />
              <text
                x={lyt.tx}
                y={-lyt.cLat + 2 + lyt.dy}
                textAnchor={textAnchor}
                className={isLocal ? `${styles.cityLabel} ${styles.cityLabelLocal}` : styles.cityLabel}
              >
                <tspan className={styles.labelTime}>{formatLocalTime(now, city.tz)}</tspan>
                {' '}{city.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function formatLocalTime(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }).format(now);
  }
}

export default WorldClockMap;

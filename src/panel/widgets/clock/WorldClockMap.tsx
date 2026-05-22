import { useMemo } from 'react';
import type { City } from './cities';
import {
  isDaylight,
  solarDeclination,
  subsolarLongitude,
  terminatorLatAt,
} from './solar';
import styles from './WorldClockMap.module.scss';

/**
 * Day/night world-clock map. Equirectangular projection (viewBox is
 * lon/lat directly), with stylised continent silhouettes drawn as
 * fixed polygon paths. The day/night terminator is computed live from
 * the supplied `now`; the unlit hemisphere is shaded by a translucent
 * overlay so continents stay visible underneath.
 *
 * Continent paths are intentionally low-detail — small enough to live
 * inline (no extra fetch / bundle dependency on a topojson file) but
 * still recognisable as the major landmasses. Coastline accuracy is
 * deliberately not the goal of this view; the goal is geographic
 * context for the city pins + a live "where is the sun right now"
 * read at a glance.
 */
interface WorldClockMapProps {
  now: Date;
  cities: readonly City[];
  formatHour12: boolean;
}

// Hand-drawn continent silhouettes. Each entry is a sequence of
// [lon, lat] coordinates; the renderer closes the polygon. Numbers
// were eyeballed against a Mercator atlas — close enough that you can
// recognise each continent without serving a 30KB topojson file. If
// the visual gets actively wrong somewhere, tighten that continent's
// vertex list — these are not intended to be canonical geography.
const CONTINENTS: Array<{ name: string; points: Array<[number, number]> }> = [
  {
    name: 'north-america',
    points: [
      [-168, 65], [-160, 71], [-140, 72], [-120, 74], [-100, 75], [-90, 80],
      [-75, 78], [-60, 80], [-55, 71], [-65, 60], [-72, 50], [-65, 45],
      [-72, 42], [-80, 35], [-82, 30], [-88, 24], [-96, 20], [-100, 25],
      [-106, 23], [-112, 24], [-118, 32], [-124, 38], [-125, 48], [-130, 54],
      [-145, 58], [-155, 60], [-165, 62], [-168, 65],
    ],
  },
  {
    name: 'central-america',
    points: [
      [-92, 17], [-86, 14], [-82, 9], [-78, 7], [-77, 10], [-83, 13], [-90, 16], [-92, 17],
    ],
  },
  {
    name: 'south-america',
    points: [
      [-78, 12], [-70, 12], [-60, 12], [-52, 5], [-44, -2], [-37, -8], [-37, -22],
      [-48, -28], [-58, -38], [-65, -45], [-70, -52], [-72, -55], [-72, -45],
      [-75, -32], [-78, -20], [-80, -8], [-80, 2], [-78, 12],
    ],
  },
  {
    name: 'greenland',
    points: [
      [-50, 60], [-30, 60], [-12, 70], [-15, 78], [-30, 83], [-48, 82], [-55, 75], [-52, 65], [-50, 60],
    ],
  },
  {
    name: 'iceland',
    points: [[-24, 63], [-13, 63], [-13, 67], [-24, 67], [-24, 63]],
  },
  {
    name: 'eurasia',
    points: [
      [-10, 58], [0, 60], [8, 66], [25, 72], [45, 75], [70, 78], [100, 78],
      [130, 75], [150, 72], [165, 70], [175, 68], [180, 70], [180, 60],
      [170, 60], [160, 60], [150, 55], [145, 50], [140, 45], [142, 40],
      [135, 35], [130, 30], [125, 28], [120, 22], [115, 18], [110, 22],
      [108, 16], [105, 12], [100, 10], [95, 16], [92, 22], [88, 22],
      [82, 20], [78, 24], [72, 23], [65, 25], [58, 22], [53, 27], [47, 30],
      [38, 30], [33, 32], [28, 36], [22, 38], [12, 38], [3, 40], [-5, 36],
      [-10, 38], [-10, 44], [-10, 50], [-10, 58],
    ],
  },
  {
    name: 'eurasia-east-wrap',
    // Far east bit that wraps past 180 (Chukotka). Drawn as a separate
    // small polygon on the western edge so the projection rendering
    // doesn't streak across the map.
    points: [[-180, 64], [-175, 65], [-175, 68], [-180, 70], [-180, 64]],
  },
  {
    name: 'africa',
    points: [
      [-15, 32], [0, 33], [12, 35], [24, 32], [33, 30], [37, 22], [42, 14],
      [49, 12], [52, 4], [48, -3], [41, -10], [40, -22], [33, -29], [25, -34],
      [18, -34], [12, -28], [10, -18], [8, -8], [5, 0], [-5, 4], [-15, 6],
      [-17, 14], [-17, 22], [-15, 32],
    ],
  },
  {
    name: 'madagascar',
    points: [[43, -12], [50, -16], [50, -25], [44, -25], [43, -12]],
  },
  {
    name: 'australia',
    points: [
      [113, -22], [120, -18], [128, -14], [138, -11], [144, -11], [152, -25],
      [149, -37], [140, -38], [130, -32], [122, -32], [115, -33], [113, -22],
    ],
  },
  {
    name: 'new-zealand-n',
    points: [[172, -34], [178, -36], [177, -41], [173, -41], [172, -34]],
  },
  {
    name: 'new-zealand-s',
    points: [[166, -42], [174, -42], [174, -47], [167, -47], [166, -42]],
  },
  {
    name: 'borneo-sumatra',
    points: [
      [95, 5], [105, 6], [110, 4], [115, 7], [119, 5], [118, -1], [114, -4],
      [107, -7], [100, -2], [95, 5],
    ],
  },
  {
    name: 'java-papua',
    points: [
      [104, -7], [120, -8], [128, -10], [140, -8], [134, -2], [130, -3],
      [120, -3], [114, -8], [108, -8], [104, -7],
    ],
  },
  {
    name: 'japan',
    points: [
      [129, 33], [140, 35], [142, 42], [145, 45], [142, 46], [138, 42],
      [134, 37], [130, 35], [129, 33],
    ],
  },
  {
    name: 'british-isles',
    points: [
      [-10, 51], [-3, 50], [2, 53], [-1, 58], [-5, 58], [-8, 55], [-10, 51],
    ],
  },
  {
    name: 'antarctica',
    points: [
      [-180, -68], [-160, -75], [-130, -76], [-100, -76], [-70, -73], [-40, -77],
      [-10, -72], [30, -72], [70, -68], [110, -68], [140, -72], [165, -78],
      [180, -75], [180, -90], [-180, -90], [-180, -68],
    ],
  },
];

const LON_STEP = 4; // terminator polyline resolution

export function WorldClockMap({ now, cities, formatHour12 }: WorldClockMapProps) {
  const declination = solarDeclination(now);
  const subLon = subsolarLongitude(now);
  const subLat = declination;

  // Terminator polyline from west to east.
  const terminatorPath = useMemo(() => {
    const pts: string[] = [];
    for (let lon = -180; lon <= 180; lon += LON_STEP) {
      const lat = terminatorLatAt(lon, subLon, declination);
      pts.push(`${lon.toFixed(2)},${(-lat).toFixed(2)}`);
    }
    return `M ${pts.join(' L ')}`;
  }, [subLon, declination]);

  // Night polygon: terminator curve closed along the south or north
  // edge of the map depending on which hemisphere is in night.
  // When dec > 0 (northern summer) the subsolar point sits in the
  // northern hemisphere, so night is south of the terminator (and
  // includes the south pole).
  const nightPath = useMemo(() => {
    const pts: string[] = [];
    for (let lon = -180; lon <= 180; lon += LON_STEP) {
      const lat = terminatorLatAt(lon, subLon, declination);
      pts.push(`${lon.toFixed(2)},${(-lat).toFixed(2)}`);
    }
    // Close along the edge: south if subLat > 0, north otherwise.
    const closeY = subLat > 0 ? 90 : -90;
    pts.push(`180,${closeY}`);
    pts.push(`-180,${closeY}`);
    return `M ${pts.join(' L ')} Z`;
  }, [subLon, declination, subLat]);

  return (
    <div className={styles.wrap}>
      <svg
        viewBox="-180 -90 360 180"
        preserveAspectRatio="none"
        className={styles.svg}
        aria-label="World map showing day and night"
      >
        {/* Ocean baseline */}
        <rect className={styles.ocean} x="-180" y="-90" width="360" height="180" />

        {/* Latitude / longitude reference grid */}
        <g className={styles.grid}>
          {[-60, -30, 0, 30, 60].map(lat => (
            <line key={`lat-${lat}`} x1="-180" y1={-lat} x2="180" y2={-lat} />
          ))}
          {[-150, -120, -90, -60, -30, 30, 60, 90, 120, 150].map(lon => (
            <line key={`lon-${lon}`} x1={lon} y1="-90" x2={lon} y2="90" />
          ))}
          {/* Heavy equator + prime meridian. */}
          <line x1="-180" y1="0" x2="180" y2="0" strokeOpacity="0.6" />
          <line x1="0" y1="-90" x2="0" y2="90" strokeOpacity="0.6" />
        </g>

        {/* Continents */}
        <g className={styles.land}>
          {CONTINENTS.map(c => (
            <polygon
              key={c.name}
              points={c.points.map(([lon, lat]) => `${lon},${-lat}`).join(' ')}
            />
          ))}
        </g>

        {/* Night overlay */}
        <path d={nightPath} className={styles.night} />

        {/* Glowing terminator line */}
        <path d={terminatorPath} className={styles.terminator} />

        {/* Sun marker at subsolar point */}
        <circle cx={subLon} cy={-subLat} r="4" className={styles.sunGlow} />
        <circle cx={subLon} cy={-subLat} r="1.4" className={styles.sun} />

        {/* Cities */}
        {cities.map(city => {
          const day = isDaylight(city.lat, city.lon, now);
          const label = formatLocalTime(now, city.tz, formatHour12);
          // Push the label inside the map by flipping its anchor when
          // the city sits in the right ~third of the projection.
          const anchorRight = city.lon > 120;
          const tx = city.lon + (anchorRight ? -2 : 2);
          const textAnchor = anchorRight ? 'end' : 'start';
          return (
            <g key={city.id}>
              <circle
                cx={city.lon}
                cy={-city.lat}
                r="1.4"
                className={day ? styles.cityDot : styles.cityDotNight}
              />
              <text
                x={tx}
                y={-city.lat - 1.2}
                textAnchor={textAnchor}
                className={styles.cityLabel}
              >
                {city.name}
              </text>
              <text
                x={tx}
                y={-city.lat + 2.6}
                textAnchor={textAnchor}
                className={styles.cityLabelTime}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function formatLocalTime(now: Date, tz: string, hour12: boolean): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      hour12,
    }).format(now);
  } catch {
    // Unknown timezone (shouldn't happen for our catalog but the
    // browser's tz set varies). Fall back to UTC so the map still
    // renders something legible.
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12 }).format(now);
  }
}

export default WorldClockMap;

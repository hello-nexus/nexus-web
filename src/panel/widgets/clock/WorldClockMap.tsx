import { useMemo } from 'react';
import type { City } from './cities';
import {
  isDaylight,
  solarDeclination,
  subsolarLongitude,
  terminatorLatAt,
} from './solar';
import { WORLD_MAP_PATH, WORLD_MAP_VIEWBOX } from './worldMapData';
import styles from './WorldClockMap.module.scss';

/**
 * Day/night world-clock map. Land outlines come from a pre-rendered,
 * vertex-thinned Natural Earth 110m coastline (see
 * `scripts/build-world-map.mjs`) — equirectangular projection, ~11 KB
 * of inline SVG path data, simple continent shapes only. ViewBox is
 * `-180 -90 360 180` so lon/lat map directly to SVG coordinates with
 * y flipped:
 *
 *   x = lon         (degrees east, -180..180)
 *   y = -lat        (south-positive SVG y)
 *
 * Cities, the day/night terminator polygon, and the subsolar sun
 * marker all project through the same identity transform.
 */
interface WorldClockMapProps {
  now: Date;
  cities: readonly City[];
  // IANA timezone of the user's "Local" entry. When a city in `cities`
  // matches this tz, its pin is highlighted on the map so the viewer
  // can immediately see where they are. No effect when no city in the
  // list matches.
  highlightTz?: string;
}

const LON_STEP = 4; // terminator polyline resolution (degrees)

export function WorldClockMap({ now, cities, highlightTz }: WorldClockMapProps) {
  const declination = solarDeclination(now);
  const subLon = subsolarLongitude(now);
  const subLat = declination;

  // Night polygon: terminator curve closed along the south or north
  // edge of the map depending on which hemisphere is in night.
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

  const terminatorPath = useMemo(() => {
    const pts: string[] = [];
    for (let lon = -180; lon <= 180; lon += LON_STEP) {
      const lat = terminatorLatAt(lon, subLon, declination);
      pts.push(`${lon.toFixed(2)},${(-lat).toFixed(2)}`);
    }
    return `M ${pts.join(' L ')}`;
  }, [subLon, declination]);

  return (
    <div className={styles.wrap}>
      <svg
        viewBox={WORLD_MAP_VIEWBOX}
        // `xMidYMid meet` scales the projection uniformly into the
        // container without stretching the continents. The wrap is
        // sized at 2:1 so there's no visible letterboxing at the
        // default dashboard width.
        preserveAspectRatio="xMidYMid meet"
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
          <line x1="-180" y1="0" x2="180" y2="0" strokeOpacity="0.6" />
          <line x1="0" y1="-90" x2="0" y2="90" strokeOpacity="0.6" />
        </g>

        {/* Land — single pre-rendered path covering every kept ring. */}
        <path d={WORLD_MAP_PATH} className={styles.land} />

        {/* Night overlay */}
        <path d={nightPath} className={styles.night} />

        {/* Glowing terminator line */}
        <path d={terminatorPath} className={styles.terminator} />

        {/* Sun marker at subsolar point */}
        <circle cx={subLon} cy={-subLat} r="4" className={styles.sunGlow} />
        <circle cx={subLon} cy={-subLat} r="1.4" className={styles.sun} />

        {/* Cities. The locally-resolved tz (if it matches a catalog
            city) gets a glowing ring + larger dot so the viewer can
            immediately spot where they are. */}
        {cities.map(city => {
          const day = isDaylight(city.lat, city.lon, now);
          const isLocal = highlightTz !== undefined && city.tz === highlightTz;
          const anchorRight = city.lon > 120;
          const tx = city.lon + (anchorRight ? -2 : 2);
          const textAnchor = anchorRight ? 'end' : 'start';
          const label = formatLocalTime(now, city.tz);
          return (
            <g key={city.tz}>
              {isLocal && (
                <circle
                  cx={city.lon}
                  cy={-city.lat}
                  r="3.5"
                  className={styles.cityLocalGlow}
                />
              )}
              <circle
                cx={city.lon}
                cy={-city.lat}
                r={isLocal ? 2 : 1.4}
                className={
                  isLocal ? styles.cityDotLocal
                  : day ? styles.cityDot
                  : styles.cityDotNight
                }
              />
              <text
                x={tx}
                y={-city.lat - 1.5}
                textAnchor={textAnchor}
                className={isLocal ? `${styles.cityLabel} ${styles.cityLabelLocal}` : styles.cityLabel}
              >
                {city.name}
              </text>
              <text
                x={tx}
                y={-city.lat + 2.9}
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

// Solar geometry: sun position, day/night terminator, daylight
// hit-test. Standard almanac approximations, ~1° accuracy.

const DEG = Math.PI / 180;

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = date.getTime() - start;
  return Math.floor(diff / 86_400_000);
}

/**
 * Solar declination in degrees: latitude where the sun is directly
 * overhead at solar noon. Swings between roughly -23.45° (December
 * solstice) and +23.45° (June solstice). Equinoxes ≈ 0.
 *
 * Cooper's approximation; within <0.5° of full NOAA orbital math.
 */
export function solarDeclination(date: Date): number {
  const n = dayOfYear(date);
  return 23.45 * Math.sin(((360 * (n - 81)) / 365) * DEG);
}

/**
 * Equation of time in minutes. Captures the irregular pace of the
 * apparent sun — Earth's elliptical orbit + axial tilt make solar
 * noon drift by up to ±16 minutes vs clock noon over the year.
 */
export function equationOfTime(date: Date): number {
  const n = dayOfYear(date);
  const b = ((360 * (n - 81)) / 365) * DEG;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/**
 * Longitude (degrees, -180..180) where the sun is directly overhead at
 * the given instant. Moves ~15°/hr westward with the rotating Earth.
 */
export function subsolarLongitude(date: Date): number {
  const utcMinutes = date.getUTCHours() * 60
    + date.getUTCMinutes()
    + date.getUTCSeconds() / 60;
  const eot = equationOfTime(date);
  // Subsolar lon = 0 when local apparent solar time is 12:00 at lon 0
  // (Greenwich). Drift 15°/hr means after `m` minutes past UTC noon the
  // sun is `(m / 4)` degrees west of 0°. EoT adjusts for the apparent
  // solar irregularity.
  let lon = -((utcMinutes - 720 + eot) / 4);
  // Wrap into [-180, 180].
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  return lon;
}

/**
 * Latitude where the day/night terminator crosses the given longitude
 * at the given instant. Day is on the side of the terminator that
 * shares its sign with the solar declination; the caller decides which
 * side to shade.
 *
 * Returns 0 at the equinoxes (declination ≈ 0), since the terminator
 * is then a great-circle meridian and only crosses the equator on the
 * day side.
 */
export function terminatorLatAt(lonDeg: number, subsolarLonDeg: number, declinationDeg: number): number {
  if (Math.abs(declinationDeg) < 0.05) return 0;
  const decRad = declinationDeg * DEG;
  const lonRad = (lonDeg - subsolarLonDeg) * DEG;
  return Math.atan(-Math.cos(lonRad) / Math.tan(decRad)) / DEG;
}

/**
 * True if the sun is above the horizon at (lat, lon) at the given
 * instant. Used to colour city markers as day vs night.
 */
export function isDaylight(latDeg: number, lonDeg: number, date: Date): boolean {
  const decRad = solarDeclination(date) * DEG;
  const subLon = subsolarLongitude(date);
  const latRad = latDeg * DEG;
  const hourAngle = (lonDeg - subLon) * DEG;
  // sin(altitude) = sin(lat)sin(dec) + cos(lat)cos(dec)cos(H). > 0 = above horizon.
  const sinAlt = Math.sin(latRad) * Math.sin(decRad)
    + Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngle);
  return sinAlt > 0;
}

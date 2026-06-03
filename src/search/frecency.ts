// "Frecency" = frequency + recency. A tiny localStorage map that floats the
// entries a user actually picks to the top, decaying as they go untouched.
// Read once per palette open (snapshot) so ranking doesn't hit storage per row.

const KEY = 'nexus.search.frecency.v1';
const HALF_LIFE_DAYS = 30;

export type FrecencyMap = Record<string, { n: number; last: number }>;

function read(): FrecencyMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FrecencyMap) : {};
  } catch {
    return {};
  }
}

function write(map: FrecencyMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // storage full / disabled — frecency is best-effort, ignore.
  }
}

/** Snapshot the current map for a ranking pass. */
export function snapshotFrecency(): FrecencyMap {
  return read();
}

/** Record that an entry was chosen. */
export function recordUse(id: string): void {
  const map = read();
  const prev = map[id] ?? { n: 0, last: 0 };
  map[id] = { n: prev.n + 1, last: Date.now() };
  write(map);
}

/**
 * Ranking boost for an entry from a snapshot. Frequency counts linearly;
 * recency decays to ~0 over HALF_LIFE_DAYS. Returns 0 for never-used ids.
 */
export function frecencyBoost(id: string, map: FrecencyMap, now: number): number {
  const e = map[id];
  if (!e) return 0;
  const ageDays = (now - e.last) / 86_400_000;
  const recency = Math.max(0, 1 - ageDays / HALF_LIFE_DAYS);
  return Math.min(e.n, 8) * 60 + recency * 350;
}

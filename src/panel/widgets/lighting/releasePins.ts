import { fetchPins, setPins } from '../../../api/lighting';

/**
 * Unpins every pinned device so the global look reaches them. Simple mode on
 * the Lighting page releases every pin on a pick for the same reason: the
 * global start only drives unpinned devices. Best effort and resolves once the
 * write settles, so the caller can start the look after it; an unreadable or
 * refused answer leaves the pins as they were.
 */
export async function releaseAllPins(): Promise<void> {
  const pins = await fetchPins();
  const ids = pins ? Object.keys(pins) : [];
  if (ids.length === 0) return;
  try {
    await setPins(ids, null);
  } catch { /* the start still runs */ }
}

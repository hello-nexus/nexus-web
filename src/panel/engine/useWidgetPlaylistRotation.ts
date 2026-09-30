import { useEffect, useMemo, useRef, useState } from 'react';
import { nextPlaylistType } from './widgetPlaylist';

/**
 * The playlist type on screen, advancing every `intervalSec`. Null when there
 * is no playlist or while paused, so the caller shows the layout's own widget.
 * A new `cursor` jumps to its type and restarts the interval.
 */
export function useWidgetPlaylistRotation(
  types: readonly string[] | null,
  intervalSec: number,
  shuffle: boolean,
  paused: boolean,
  cursor?: { type: string; at: number },
): string | null {
  // Keyed by content: every record echo hands over a fresh array, and a new
  // identity would restart the running interval.
  const typesKey = types ? types.join('\n') : '';
  const list = useMemo(() => (typesKey ? typesKey.split('\n') : []), [typesKey]);
  const cursorAt = cursor?.at ?? 0;
  const cursorType = cursor?.type ?? null;
  const [current, setCurrent] = useState<string | null>(cursorType);
  const [appliedCursorAt, setAppliedCursorAt] = useState(cursorAt);
  if (cursorAt !== appliedCursorAt) {
    setAppliedCursorAt(cursorAt);
    setCurrent(cursorType);
  }
  const lapRef = useRef<string[]>([]);
  const shown = list.length === 0 ? null : current !== null && list.includes(current) ? current : list[0];

  useEffect(() => {
    if (paused || shown === null || list.length < 2) return;
    const handle = setTimeout(
      () => setCurrent(nextPlaylistType(list, shown, shuffle, lapRef.current)),
      intervalSec * 1000,
    );
    return () => clearTimeout(handle);
  }, [list, shown, intervalSec, shuffle, paused, appliedCursorAt]);

  return paused ? null : shown;
}

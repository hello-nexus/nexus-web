import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The opaque-widget notice follows a media change: when the background media was just committed
 * while the widget covers it, the notice shows once. It hides on dismiss or when the widget stops
 * covering, and returns only on the next media change.
 */
export function useMediaChangeNotice(covered: boolean): { visible: boolean; notify: () => void; dismiss: () => void } {
  const [shown, setShown] = useState(false);
  const latest = useRef(covered);
  useEffect(() => {
    latest.current = covered;
    if (!covered) setShown(false);
  }, [covered]);
  const notify = useCallback(() => setShown(latest.current), []);
  const dismiss = useCallback(() => setShown(false), []);
  return { visible: shown && covered, notify, dismiss };
}

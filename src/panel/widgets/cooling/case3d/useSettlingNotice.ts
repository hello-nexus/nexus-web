import { useEffect, useState } from 'react';
import type { CaseSceneRenderer } from './coolingCaseRenderer';

/** How long a solve may run before the view says so: a fast GPU settles first and never shows it. */
export const SETTLING_NOTICE_DELAY_MS = 1500;
/** Once shown, the notice stays at least this long, so a solve settling just after the delay does not flash it. */
export const SETTLING_NOTICE_MIN_SHOWN_MS = 600;

/** True once the airflow solve has been settling for the delay, false once it is steady and the minimum display time has passed; each re-solve starts the delay again. */
export function useSettlingNotice(renderer: CaseSceneRenderer | null): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!renderer) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let shownAt = 0;
    const stop = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
    renderer.setSettlingListener(settling => {
      stop();
      if (settling) {
        timer = setTimeout(() => { timer = null; shownAt = Date.now(); setShown(true); }, SETTLING_NOTICE_DELAY_MS);
        return;
      }
      const left = shownAt ? SETTLING_NOTICE_MIN_SHOWN_MS - (Date.now() - shownAt) : 0;
      const hide = () => { timer = null; shownAt = 0; setShown(false); };
      if (left > 0) timer = setTimeout(hide, left);
      else hide();
    });
    return () => { stop(); renderer.setSettlingListener(null); setShown(false); };
  }, [renderer]);
  return shown;
}

import { useEffect, useState } from 'react';
import type { CaseSceneRenderer } from './coolingCaseRenderer';

/** How long a solve may run before the view says so: a fast GPU settles first and never shows it. */
export const SETTLING_NOTICE_DELAY_MS = 1500;

/** True once the airflow solve has been settling for the delay, false as soon as it is steady; each re-solve starts the delay again. */
export function useSettlingNotice(renderer: CaseSceneRenderer | null): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!renderer) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
    renderer.setSettlingListener(settling => {
      stop();
      if (settling) timer = setTimeout(() => { timer = null; setShown(true); }, SETTLING_NOTICE_DELAY_MS);
      else setShown(false);
    });
    return () => { stop(); renderer.setSettlingListener(null); setShown(false); };
  }, [renderer]);
  return shown;
}

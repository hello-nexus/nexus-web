import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpeaker, type SpeakerState } from '../../../api/logitechSpeaker';

const POLL_MS = 3000;

type Change = () => Promise<SpeakerState | null>;

/**
 * The speaker's state, polled, plus `change` to send a write. A write answers with the state
 * after it, which is applied at once; a poll that began before a write started or landed is
 * dropped, so it cannot put the older state back.
 */
export function useLogitechSpeaker() {
  const [state, setState] = useState<SpeakerState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const epoch = useRef(0);
  const writing = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    let busy = false;
    const load = () => {
      if (busy || writing.current > 0) return;
      busy = true;
      const started = epoch.current;
      void fetchSpeaker(ctl.signal).then(next => {
        busy = false;
        if (ctl.signal.aborted || !alive.current) return;
        if (!next) {
          setLoadFailed(true);
          return;
        }
        setLoadFailed(false);
        if (started === epoch.current) setState(next);
      });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      window.clearInterval(timer);
      ctl.abort();
    };
  }, []);

  const change = useCallback(async (call: Change) => {
    writing.current += 1;
    epoch.current += 1;
    let next: SpeakerState | null = null;
    try {
      next = await call();
    } finally {
      writing.current -= 1;
      epoch.current += 1;
    }
    if (!alive.current) return false;
    if (next) setState(next);
    setFailed(!next);
    return next !== null;
  }, []);

  return { state, loadFailed, failed, change };
}

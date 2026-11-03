import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSpeaker, type SpeakerState } from '../../../api/logitechSpeaker';

const POLL_MS = 3000;
// How long a failure notice stays when nothing else clears it.
const NOTICE_MS = 6000;
const FAILED_KEY = 'devices.logitechSpeaker.failed';

type Change = () => Promise<SpeakerState | null>;

/**
 * The speaker's state, polled, plus `change` to send a write. Every request takes the next
 * sequence number and only a reply newer than the last one applied is shown, so a slow or
 * out-of-order reply never puts older state back. A poll that began before a write started is
 * dropped, and polls pause while a write is in flight.
 */
export function useLogitechSpeaker() {
  const [state, setState] = useState<SpeakerState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const alive = useRef(true);
  const seq = useRef(0);
  const applied = useRef(0);
  const lastWrite = useRef(0);
  const writing = useRef(0);
  const noticeTimer = useRef(0);

  const clearNotice = useCallback(() => {
    window.clearTimeout(noticeTimer.current);
    setFailure(null);
  }, []);

  /** Shows a failure notice (an i18n key) until the next good reply or a short while. */
  const report = useCallback((key: string) => {
    window.clearTimeout(noticeTimer.current);
    setFailure(key);
    noticeTimer.current = window.setTimeout(() => setFailure(null), NOTICE_MS);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    let busy = false;
    const load = () => {
      if (busy || writing.current > 0) return;
      busy = true;
      const mine = ++seq.current;
      void fetchSpeaker(ctl.signal).then(next => {
        busy = false;
        if (ctl.signal.aborted || !alive.current) return;
        if (!next) {
          setLoadFailed(true);
          return;
        }
        setLoadFailed(false);
        if (mine > lastWrite.current && mine > applied.current && writing.current === 0) {
          applied.current = mine;
          setState(next);
          clearNotice();
        }
      });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      window.clearInterval(timer);
      ctl.abort();
    };
  }, [clearNotice]);

  const change = useCallback(async (call: Change) => {
    const mine = ++seq.current;
    lastWrite.current = mine;
    writing.current += 1;
    let next: SpeakerState | null = null;
    try {
      next = await call();
    } finally {
      writing.current -= 1;
    }
    if (!alive.current) return false;
    if (!next) {
      report(FAILED_KEY);
      return false;
    }
    if (mine > applied.current) {
      applied.current = mine;
      setState(next);
      clearNotice();
    }
    return true;
  }, [report, clearNotice]);

  return { state, loadFailed, failure, report, change };
}

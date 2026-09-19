import { useEffect, useState } from 'react';
import { completePanelSwipeOnboarding, fetchPanelSwipeOnboarding } from '../../api/onboarding';

// Swipe-up hand shown every period until the actions tray opens once; the
// first open marks the install done (settings.json, cleared by factory
// reset only) and swaps the hand for a one-shot notice the next tap ends.
export const SWIPE_HINT_PERIOD_MS = 15_000;
export const SWIPE_HINT_CYCLE_MS = 800;
export const SWIPE_HINT_CYCLES = 3;
export const SWIPE_HINT_VISIBLE_MS = SWIPE_HINT_CYCLE_MS * SWIPE_HINT_CYCLES;

type Status = 'unknown' | 'pending' | 'completed';

interface Options {
  enabled: boolean;
  blocked: boolean;
  trayOpen: boolean;
}

export function usePanelSwipeOnboarding({ enabled, blocked, trayOpen }: Options) {
  const [status, setStatus] = useState<Status>('unknown');
  const [hintVisible, setHintVisible] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(false);

  // Any failure (a service without the route, a relay hop that drops it)
  // reads as completed: a panel must never nag because a request failed.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchPanelSwipeOnboarding()
      .then(data => { if (!cancelled) setStatus(data?.completed === false ? 'pending' : 'completed'); })
      .catch(() => { if (!cancelled) setStatus('completed'); });
    return () => { cancelled = true; };
  }, [enabled]);

  // The clock restarts on every unblock, so a closed sheet is followed by a
  // full quiet period rather than an instant hand.
  const showing = status === 'pending' && enabled && !blocked && !trayOpen;
  useEffect(() => {
    if (!showing) return;
    let hide: ReturnType<typeof window.setTimeout> | null = null;
    const period = window.setInterval(() => {
      setHintVisible(true);
      hide = window.setTimeout(() => { hide = null; setHintVisible(false); }, SWIPE_HINT_VISIBLE_MS);
    }, SWIPE_HINT_PERIOD_MS);
    return () => {
      window.clearInterval(period);
      if (hide) window.clearTimeout(hide);
      setHintVisible(false);
    };
  }, [showing]);

  // Any open counts (swipe or the background long-press): the tray is what
  // the hand teaches. A lost POST re-fetches as pending, and the next open
  // posts again.
  useEffect(() => {
    if (!trayOpen || status !== 'pending') return;
    setStatus('completed');
    setNoticeVisible(true);
    completePanelSwipeOnboarding().catch(() => {});
  }, [trayOpen, status]);

  useEffect(() => {
    if (!noticeVisible) return;
    if (!trayOpen) { setNoticeVisible(false); return; }
    const dismiss = () => setNoticeVisible(false);
    document.addEventListener('pointerdown', dismiss, { capture: true });
    return () => document.removeEventListener('pointerdown', dismiss, { capture: true });
  }, [noticeVisible, trayOpen]);

  return { hintVisible, noticeVisible };
}

import { useEffect, useState } from 'react';
import { pingService } from '../../../api/service';
import { fetchSystemCaseId, fetchSystemPreview, SYSTEM_PREVIEW_CHANGED_EVENT } from '../../../api/systemPreview';
import { isMacAppShell } from '../../../app/windowActions';

export const PING_RETRY_MIN_MS = 2000;
export const PING_RETRY_MAX_MS = 16000;
export const FOCUS_COALESCE_MS = 3000;

interface PreviewState {
  loaded: boolean;
  caseId: string | null;
  previewUrl: string | null;
}

const EMPTY: PreviewState = { loaded: false, caseId: null, previewUrl: null };

/** Whether the host PC runs macOS. Null only until the first ping settles; a failed ping reads as not macOS and keeps retrying (backoff and on focus) until the service answers. */
export function useHostIsMac(enabled: boolean): boolean | null {
  const shell = isMacAppShell();
  const [isMac, setIsMac] = useState<boolean | null>(shell ? true : null);
  const [confirmed, setConfirmed] = useState(shell);

  useEffect(() => {
    if (!enabled || confirmed) return undefined;
    let cancelled = false;
    let inFlight = false;
    let delay = PING_RETRY_MIN_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempt = async () => {
      if (inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      let ping = null;
      try {
        ping = await pingService();
      } catch {
        ping = null;
      }
      inFlight = false;
      if (cancelled) return;
      if (ping) {
        setIsMac(ping.platform === 'macos');
        setConfirmed(true);
        return;
      }
      setIsMac(prev => prev ?? false);
      timer = setTimeout(() => { void attempt(); }, delay);
      delay = Math.min(delay * 2, PING_RETRY_MAX_MS);
    };

    void attempt();
    const onFocus = () => { void attempt(); };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, confirmed]);

  return isMac;
}

/** The saved case id and the stored preview as an object URL, refreshed on mount, window focus, and the preview-changed event. */
export function useBuildPreview(enabled: boolean): PreviewState {
  const [state, setState] = useState<PreviewState>(EMPTY);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let seq = 0;
    let inFlight = false;
    let lastStart = Number.NEGATIVE_INFINITY;
    let currentUrl: string | null = null;
    let currentEtag: string | null = null;

    const refresh = async () => {
      const run = ++seq;
      inFlight = true;
      lastStart = Date.now();
      try {
        const [caseId, preview] = await Promise.all([fetchSystemCaseId(), fetchSystemPreview(currentEtag)]);
        if (cancelled || run !== seq) return;
        if (preview.kind === 'error') {
          setState(prev => ({ loaded: true, caseId: caseId ?? prev.caseId, previewUrl: prev.previewUrl }));
          return;
        }
        const previous = currentUrl;
        if (preview.kind === 'image') {
          currentUrl = URL.createObjectURL(preview.blob);
          currentEtag = preview.etag;
        } else if (preview.kind === 'none') {
          currentUrl = null;
          currentEtag = null;
        }
        setState({ loaded: true, caseId, previewUrl: currentUrl });
        if (previous && previous !== currentUrl) URL.revokeObjectURL(previous);
      } catch {
        if (!cancelled && run === seq) setState(prev => ({ ...prev, loaded: true }));
      } finally {
        if (run === seq) inFlight = false;
      }
    };

    // A burst of focus events (alt-tab, window restore) collapses into one request; a preview change always refetches.
    const onFocus = () => {
      if (inFlight || Date.now() - lastStart < FOCUS_COALESCE_MS) return;
      void refresh();
    };
    const onChanged = () => { void refresh(); };

    void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener(SYSTEM_PREVIEW_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(SYSTEM_PREVIEW_CHANGED_EVENT, onChanged);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [enabled]);

  return state;
}

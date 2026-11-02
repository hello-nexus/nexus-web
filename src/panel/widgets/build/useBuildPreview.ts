import { useEffect, useRef, useState } from 'react';
import { pingService } from '../../../api/service';
import { fetchSystemCaseId, fetchSystemPreview, SYSTEM_CASE_TOPIC, SYSTEM_PREVIEW_CHANGED_EVENT, type SystemPreviewResult } from '../../../api/systemPreview';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { isMacAppShell } from '../../../app/windowActions';
import { loadNoCasePreview } from '../../../components/views/BuildPage/noCasePreview';

export const PING_RETRY_MIN_MS = 2000;
export const PING_RETRY_MAX_MS = 16000;
export const FOCUS_COALESCE_MS = 3000;

interface PreviewState {
  loaded: boolean;
  caseId: string | null;
  previewUrl: string | null;
  /** How many pixels across the stored image is; null when there is none or its header could not be read. */
  previewWidth: number | null;
}

const EMPTY: PreviewState = { loaded: false, caseId: null, previewUrl: null, previewWidth: null };

/** The width in pixels a PNG declares in its header; null for anything else. */
export async function readPngWidth(blob: Blob): Promise<number | null> {
  try {
    const head = new DataView(await blob.slice(0, 24).arrayBuffer());
    if (head.byteLength < 24 || head.getUint32(0) !== 0x89504e47 || head.getUint32(12) !== 0x49484452) return null;
    const width = head.getUint32(16);
    return width > 0 ? width : null;
  } catch {
    return null;
  }
}

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

/** The saved case id and the stored preview as an object URL, refreshed on mount, window focus, the preview-changed event and the service's case signal (a Y70 display assigns its case after detection). */
export function useBuildPreview(enabled: boolean): PreviewState {
  const [state, setState] = useState<PreviewState>(EMPTY);
  const refreshRef = useRef<(() => void) | null>(null);
  useTopicCallback(SYSTEM_CASE_TOPIC, enabled, () => { refreshRef.current?.(); });

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let seq = 0;
    let inFlight = false;
    let lastStart = Number.NEGATIVE_INFINITY;
    let currentUrl: string | null = null;
    let currentEtag: string | null = null;
    let currentWidth: number | null = null;

    const refresh = async () => {
      const run = ++seq;
      inFlight = true;
      lastStart = Date.now();
      try {
        const [caseId, preview] = await Promise.all([fetchSystemCaseId(), fetchSystemPreview(currentEtag)]);
        if (cancelled || run !== seq) return;
        if (preview.kind === 'error') {
          setState(prev => ({ loaded: true, caseId: caseId ?? prev.caseId, previewUrl: prev.previewUrl, previewWidth: prev.previewWidth }));
          return;
        }
        // With no case chosen the service holds no image; the one drawn for the open PC is kept by the host.
        const local = caseId === null && preview.kind !== 'image' ? loadNoCasePreview() : null;
        const shown: SystemPreviewResult = local ? { kind: 'image', blob: local, etag: null } : preview;
        const width = shown.kind === 'image' ? await readPngWidth(shown.blob) : null;
        if (cancelled || run !== seq) return;
        const previous = currentUrl;
        if (shown.kind === 'image') {
          currentUrl = URL.createObjectURL(shown.blob);
          currentEtag = shown.etag;
          currentWidth = width;
        } else if (shown.kind === 'none') {
          currentUrl = null;
          currentEtag = null;
          currentWidth = null;
        }
        setState({ loaded: true, caseId, previewUrl: currentUrl, previewWidth: currentWidth });
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
    refreshRef.current = onChanged;
    window.addEventListener('focus', onFocus);
    window.addEventListener(SYSTEM_PREVIEW_CHANGED_EVENT, onChanged);
    return () => {
      cancelled = true;
      refreshRef.current = null;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(SYSTEM_PREVIEW_CHANGED_EVENT, onChanged);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [enabled]);

  return state;
}

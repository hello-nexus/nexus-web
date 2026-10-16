import { useEffect, useState } from 'react';
import { pingService } from '../../../api/service';
import { fetchSystemCaseId, fetchSystemPreview, SYSTEM_PREVIEW_CHANGED_EVENT } from '../../../api/systemPreview';
import { isMacAppShell } from '../../../app/windowActions';

interface PreviewState {
  loaded: boolean;
  caseId: string | null;
  previewUrl: string | null;
}

const EMPTY: PreviewState = { loaded: false, caseId: null, previewUrl: null };

/** Whether the host PC runs macOS; null until the service answers. */
export function useHostIsMac(enabled: boolean): boolean | null {
  const [isMac, setIsMac] = useState<boolean | null>(() => (isMacAppShell() ? true : null));
  useEffect(() => {
    if (!enabled || isMac !== null) return undefined;
    let cancelled = false;
    void pingService().then(ping => {
      if (!cancelled && ping) setIsMac(ping.platform === 'macos');
    });
    return () => { cancelled = true; };
  }, [enabled, isMac]);
  return isMac;
}

/** The saved case id and the stored preview as an object URL, refreshed on mount, window focus, and the preview-changed event. */
export function useBuildPreview(enabled: boolean): PreviewState {
  const [state, setState] = useState<PreviewState>(EMPTY);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let seq = 0;
    let currentUrl: string | null = null;

    const refresh = async () => {
      const run = ++seq;
      const [caseId, blob] = await Promise.all([fetchSystemCaseId(), fetchSystemPreview()]);
      if (cancelled || run !== seq) return;
      const previous = currentUrl;
      currentUrl = blob ? URL.createObjectURL(blob) : null;
      setState({ loaded: true, caseId, previewUrl: currentUrl });
      if (previous) URL.revokeObjectURL(previous);
    };

    void refresh();
    const onRefresh = () => { void refresh(); };
    window.addEventListener('focus', onRefresh);
    window.addEventListener(SYSTEM_PREVIEW_CHANGED_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener(SYSTEM_PREVIEW_CHANGED_EVENT, onRefresh);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [enabled]);

  return state;
}

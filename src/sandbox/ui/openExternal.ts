// Opens an https URL in the SYSTEM browser, not in the panel's own WebView.
// The service route runs in the user's desktop session, so a kiosk panel
// (Y70, Q-series) or the desktop dashboard both land the page on the PC's
// default browser. window.open is the fallback when the service is not
// reachable (a web-hosted remote panel), never the first choice: a kiosk
// WebView has nowhere to put a new window.
import { postService } from '../../api/service';

const HTTPS = /^https:\/\/[^\s/]+/i;

export function isExternalHttpsUrl(url: unknown): url is string {
  return typeof url === 'string' && HTTPS.test(url);
}

// The route answers the ApiResponse envelope at HTTP 200 whether or not it
// could open anything (no interactive session, rejected URL), so success is
// the envelope's error flag, not the status.
export async function openExternalUrl(url: string): Promise<void> {
  if (!isExternalHttpsUrl(url)) return;
  let opened = false;
  try {
    const res = await postService<{ error?: boolean }>('/system/open-url', { url });
    opened = res !== null && res.error !== true;
  } catch {
    opened = false;
  }
  if (!opened) window.open(url, '_blank', 'noopener');
}

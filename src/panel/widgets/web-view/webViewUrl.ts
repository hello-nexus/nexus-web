// A bare host or host:port gets https://; any other scheme is refused.
const HTTP_SCHEME = /^https?:\/\//i;
// A scheme prefix that is not just "host:port" (localhost:8080 has digits after the colon).
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d+(\/|$))/i;

/** The canonical http(s) url for user input, or null when it is not a usable web address. */
export function normalizeWebViewUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || /\s/.test(text)) return null;
  let candidate = text;
  if (!HTTP_SCHEME.test(candidate)) {
    if (OTHER_SCHEME.test(candidate)) return null;
    candidate = `https://${candidate.replace(/^\/\//, '')}`;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function webViewHostName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** The site name shown on surfaces with no native view: the host without a leading "www.". */
export function webViewSiteName(url: string): string {
  return webViewHostName(url).replace(/^www\./i, '');
}

// Shared host-side egress: POST a widget's outbound HTTPS request to the
// service's SSRF-guarded /widgets-api/proxy with the cert/manifest allowlist.
// Used by both the declarative Tier-2 worker host and the sandboxed SDK host so
// the brokered-fetch path exists once.

import { getToken, handleUnauthorized } from '../../api/auth';
import { resolveHttp } from '../../api/service';

export interface ProxyRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Returns the proxy's `{ ok, status, statusText, headers, body }` envelope. */
export async function proxyFetch(
  widgetId: string,
  req: ProxyRequest,
  allowedHosts: string[],
): Promise<unknown> {
  const post = async (token: string | null) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(resolveHttp('/widgets-api/proxy'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        widgetId,
        url: req.url,
        method: req.method,
        headers: req.headers,
        body: req.body,
        allowedHosts,
      }),
    });
  };
  let res = await post(await getToken());
  if (res.status === 401) {
    const next = await handleUnauthorized();
    if (next) res = await post(next);
  }
  return res.json();
}

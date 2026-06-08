// Shared host-side egress: POST a widget's outbound HTTPS request to the
// service's SSRF-guarded /widgets-api/proxy with the cert/manifest allowlist.
// Used by both the declarative Tier-2 worker host and the sandboxed SDK host.
//
// Routes through postService (relay-aware): on a remotely-connected panel the
// call tunnels over the relay instead of hitting http://localhost, so brokered
// fetch works off-LAN.

import { postService } from '../../api/service';

export interface ProxyRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** Returns the proxy's `{ ok, status, statusText, headers, body }` envelope
 *  (or null if the request couldn't be made). */
export async function proxyFetch(
  widgetId: string,
  req: ProxyRequest,
  allowedHosts: string[],
): Promise<unknown> {
  return postService('/widgets-api/proxy', {
    widgetId,
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
    allowedHosts,
  });
}

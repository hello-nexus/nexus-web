// Site-icon API client over the local service's GET /deck/site-icon?url=<url>,
// returning image bytes (404 when the site serves no usable icon). The fetch
// runs service-side because a panel surface has no route to the open internet.
import { fetchServiceBlob } from './service';

export function siteIconPath(url: string): string {
  return `/deck/site-icon?url=${encodeURIComponent(url)}`;
}

export function fetchSiteIcon(url: string): Promise<Blob | null> {
  return fetchServiceBlob(siteIconPath(url));
}

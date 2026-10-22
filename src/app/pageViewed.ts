import { useEffect, useRef } from 'react';
import { postService } from '../api/service';

// Top-level dashboard views reported as page_viewed. The slug is the view id.
// Marketplace app pages (app_page_opened) and the dev-only tools view are not
// listed, so they are never reported here.
const REPORTED_VIEWS: ReadonlySet<string> = new Set([
  'dashboard',
  'monitoring',
  'screentime',
  'benchmark',
  'lighting',
  'smart-lights',
  'home-assistant',
  'cooling',
  'devices',
  'device',
  'diagnostics',
  'frames',
  'store',
  'build',
  'clock',
  'weather',
  'steam',
  'gallery',
  'settings',
  'profiles',
  'account',
]);

/** Slug for a dashboard view id, or null when the view is not reported. */
export function pageViewSlug(view: string): string | null {
  return REPORTED_VIEWS.has(view) ? view : null;
}

/** Fire-and-forget; an older service without the route answers 404, which is swallowed. */
export function reportPageViewed(slug: string): void {
  postService<unknown>(`/telemetry/page-viewed/${encodeURIComponent(slug)}`, {}).catch(() => {});
}

/** Posts once each time the active view changes to a different reported page. */
export function usePageViewed(view: string): void {
  const last = useRef<string | null>(null);
  const slug = pageViewSlug(view);
  useEffect(() => {
    if (!slug || last.current === slug) return;
    last.current = slug;
    reportPageViewed(slug);
  }, [slug]);
}

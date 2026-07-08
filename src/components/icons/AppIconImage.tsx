import { getTokenSync } from '../../api/auth';

// Renders an app's manifest icon (an authed `/apps-api/installed/<id>/asset/...`
// URL) as a small square glyph. An <img> can't carry a Bearer header, so the
// session token rides the query string - same scheme as panel-background media.
// The SVG's own preserveAspectRatio letterboxes a wide mark into the square box.
export function AppIconImage({ src, size = 14 }: { src: string; size?: number }) {
  const tok = getTokenSync();
  const url = tok ? `${src}${src.includes('?') ? '&' : '?'}token=${encodeURIComponent(tok)}` : src;
  return <img src={url} width={size} height={size} alt="" aria-hidden="true" />;
}

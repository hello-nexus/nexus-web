import { getTokenSync } from '../../api/auth';
import { resolveHttp } from '../../api/service';
import type { AppIcon } from '../../panel/widgets/types';

// Renders an app's manifest icon (an authed `/apps-api/installed/<id>/asset/...`
// URL) as a small square glyph. An <img> can't carry a Bearer header, so the
// session token rides the query string - same scheme as panel-background media.
// The SVG's own preserveAspectRatio letterboxes a wide mark into the square box.
// resolveHttp: on a remote origin a relative src would send the token to the website.
function AppIconImage({ src, size = 14 }: { src: string; size?: number | string }) {
  const tok = getTokenSync();
  const abs = resolveHttp(src);
  const url = tok ? `${abs}${abs.includes('?') ? '&' : '?'}token=${encodeURIComponent(tok)}` : abs;
  return <img src={url} width={size} height={size} alt="" aria-hidden="true" />;
}

// Adapts an app's manifest icon URL into the component shape a lucide glyph
// has, so a synthetic app manifest carries its own mark and every `meta.icon`
// render site draws it without a special case.
//
// Cached per URL: makeMarketplaceAppManifest rebuilds the manifest on every
// lookupApp / getCatalogEntries call, and a fresh component identity each time
// would remount the <img> on every render.
const iconComponents = new Map<string, AppIcon>();

export function appIconComponent(src: string): AppIcon {
  const hit = iconComponents.get(src);
  if (hit) return hit;
  const Component: AppIcon = ({ size }) => <AppIconImage src={src} size={size} />;
  iconComponents.set(src, Component);
  return Component;
}

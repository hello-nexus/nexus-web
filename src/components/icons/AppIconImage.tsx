import type { CSSProperties } from 'react';
import { getTokenSync } from '../../api/auth';
import { resolveHttp } from '../../api/service';
import type { AppIcon } from '../../panel/widgets/types';
import styles from './AppIconImage.module.scss';

// An app's manifest icon is an authed `/apps-api/installed/<id>/asset/...` URL.
// Neither an <img> nor a CSS mask can carry a Bearer header, so the session
// token rides the query string - same scheme as panel-background media.
// resolveHttp: on a remote origin a relative src would send the token to the website.
function appIconUrl(src: string): string {
  const tok = getTokenSync();
  const abs = resolveHttp(src);
  return tok ? `${abs}${abs.includes('?') ? '&' : '?'}token=${encodeURIComponent(tok)}` : abs;
}

// A small square glyph; the SVG's own preserveAspectRatio letterboxes a wide
// mark into the square box.
function AppIconImage({ src, size = 14 }: { src: string; size?: number | string }) {
  return <img src={appIconUrl(src)} width={size} height={size} alt="" aria-hidden="true" />;
}

// The icon path comes from the app's manifest, so a quote, backslash, paren or
// line break in it must not end the CSS string and append a second url() that
// the token would follow. Percent-encoding them keeps the same URL.
function cssUrl(url: string): string {
  const safe = url.replace(/["'()\\\t\n\f\r ]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  return `url("${safe}")`;
}

// The same mark as a silhouette in the surrounding text colour, so it sits with
// the line glyphs beside it and follows their hover and active colours. The
// art's own colours are dropped; only its shape is kept, letterboxed by the
// mask's contain sizing.
function AppIconMask({ src, size = 14 }: { src: string; size?: number | string }) {
  const style = { width: size, height: size, '--icon-url': cssUrl(appIconUrl(src)) } as CSSProperties;
  return <span className={styles.mask} style={style} aria-hidden="true" />;
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

const maskComponents = new Map<string, AppIcon>();

/** appIconComponent's silhouette form, for rows of monochrome glyphs (the sidebar). */
export function appIconMaskComponent(src: string): AppIcon {
  const hit = maskComponents.get(src);
  if (hit) return hit;
  const Component: AppIcon = ({ size }) => <AppIconMask src={src} size={size} />;
  maskComponents.set(src, Component);
  return Component;
}

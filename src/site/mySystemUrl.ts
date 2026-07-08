// The app surface lives on the my. subdomain of whatever host serves the
// marketing page (my.hellonexus.com in prod, my.localhost:<port> for a local
// `node server.js` preview - browsers resolve *.localhost to loopback). The
// vite dev server has no host routing and serves the SPA at its own root.
function mySystemOrigin(): string | null {
  if (import.meta.env.DEV) return null;
  const { protocol, host } = window.location;
  const bare = host.toLowerCase().replace(/^www\./, '');
  if (bare.startsWith('my.')) return null;
  return `${protocol}//my.${bare}`;
}

export function mySystemHref(path = '/'): string {
  const origin = mySystemOrigin();
  return origin ? `${origin}${path}` : path;
}

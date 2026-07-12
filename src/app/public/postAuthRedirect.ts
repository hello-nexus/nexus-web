import { getCachedAccount } from '../../api/directApiBackend';

// On my.* the root is the dashboard (or the launch/download gate) - already
// the right landing spot for a signed-in visitor. The bare marketing host has
// no signed-in affordance at '/', so a signed-in visitor there goes to their
// own public profile instead; falls back to '/' if the username somehow
// isn't cached yet (the login/recovery call that just succeeded populates it
// before this ever runs).
export function resolvePostAuthPath(): string {
  const my = window.location.hostname.toLowerCase().startsWith('my.');
  if (my) return '/';
  const username = getCachedAccount()?.username;
  return username ? `/u/${encodeURIComponent(username)}` : '/';
}

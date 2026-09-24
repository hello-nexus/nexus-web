import { fetchService, postService } from './service';

/**
 * The dashboard route to restore when a window reopens. Held in the service's
 * process memory, so it survives closing the window but not a service start -
 * a system boot or a proper shutdown lands on home.
 */
export interface LastRoute {
  path: string;
}

export async function fetchLastRoute(): Promise<string> {
  const result = await fetchService<LastRoute>('/session/last-route');
  return result?.path ?? '';
}

export function saveLastRoute(path: string): Promise<LastRoute | null> {
  return postService<LastRoute>('/session/last-route', { path });
}

/**
 * The sidebar's "recently opened" app keys, oldest first. Same lifetime as
 * the last route: held in the service's process memory, so closing the window
 * keeps them and a service start clears them.
 */
export interface RecentApps {
  keys: string[];
}

export async function fetchRecentApps(): Promise<string[]> {
  const result = await fetchService<RecentApps>('/session/recent-apps');
  return result?.keys ?? [];
}

export function saveRecentApps(keys: string[]): Promise<RecentApps | null> {
  return postService<RecentApps>('/session/recent-apps', { keys });
}

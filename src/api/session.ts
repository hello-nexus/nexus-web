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

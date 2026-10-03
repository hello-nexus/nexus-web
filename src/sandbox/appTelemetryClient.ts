// Host side of the SDK's track(): forwards an app event to the service and
// reports a rejection to the console, where the app's author looks, never to
// the user. Only wired in DEV_TOOLS builds; the service route exists only there.
import { postService } from '../api/service';

export type TelemetrySurface = 'page' | 'widget' | 'immersive';

export function telemetrySurface(surface: 'cell' | 'page' | 'immersive'): TelemetrySurface {
  return surface === 'cell' ? 'widget' : surface;
}

export async function sendAppTelemetry(
  appId: string,
  surface: 'cell' | 'page' | 'immersive',
  event: string,
  properties?: Record<string, string | number | boolean>,
): Promise<void> {
  try {
    const res = await postService<{ error: boolean; msg: string }>(
      `/apps-api/telemetry/${encodeURIComponent(appId)}`,
      { event, properties, surface: telemetrySurface(surface) },
    );
    if (res?.error) console.error(`[sdk:${appId}] track("${event}") rejected: ${res.msg}`);
  } catch (err) {
    console.error(`[sdk:${appId}] track("${event}") failed`, err);
  }
}

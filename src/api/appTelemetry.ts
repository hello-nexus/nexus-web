// Recent app_* product-telemetry events held by a DEV_TOOLS service, for the Tools page.
import { fetchService } from './service';

export type PosthogStatus = 'on' | 'off' | 'opted_out';

export interface AppTelemetryEvent {
  at: string;
  event: string;
  properties: Record<string, string | number | boolean>;
}

export interface AppTelemetryRecent {
  posthog: PosthogStatus;
  events: AppTelemetryEvent[];
}

export async function fetchAppTelemetryRecent(): Promise<AppTelemetryRecent | null> {
  return fetchService<AppTelemetryRecent>('/apps-api/telemetry/recent');
}

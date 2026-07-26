import { fetchService } from './service';

export interface TelemetryConsentResponse {
  enabled: boolean;
}

export async function fetchTelemetryConsent() {
  return fetchService<TelemetryConsentResponse>('/telemetry/consent');
}

import { requestJson } from './fetchOutcome';

export interface SmartPollDrive {
  id: string;
  name: string;
  /** Seconds between SMART reads; 0 = never. */
  seconds: number;
  usesDefault: boolean;
  /** Null when the drive's media type could not be determined. */
  rotational?: boolean | null;
}

export interface SmartPollResponse {
  defaultSeconds: number;
  perDrive: boolean;
  choices: number[];
  drives: SmartPollDrive[];
}

export const SMART_POLL_NEVER = 0;

/** Ordered coarsest-last, matching the service's SmartPollPolicy.Choices. */
export const SMART_POLL_CHOICES = [1, 2, 3, 4, 5, 10, 20, 30, 60, 120, 180, 240, 300, SMART_POLL_NEVER];

export const DEFAULT_SMART_POLL_SECONDS = 30;

/** Only a platter drive parks heads, so an SSD has no reason to be slowed. Mirrors SmartPollPolicy.DefaultSecondsFor. */
export function defaultSecondsForMedia(rotational: boolean | null | undefined): number {
  return rotational === false ? 1 : DEFAULT_SMART_POLL_SECONDS;
}

export async function fetchSmartPoll(): Promise<SmartPollResponse | null> {
  const { data } = await requestJson<SmartPollResponse>('/monitoring/smart-poll');
  return data;
}

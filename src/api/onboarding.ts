import { fetchService, postService } from './service';

export interface OnboardingStatusResponse {
  completed: boolean;
  /** Absent on services that predate the lighting onboarding screen. */
  lightingCompleted?: boolean;
}

export async function fetchOnboardingStatus() {
  return fetchService<OnboardingStatusResponse>('/onboarding');
}

export async function completeOnboarding() {
  return postService<OnboardingStatusResponse>('/onboarding/complete', {});
}

export async function completeLightingOnboarding() {
  return postService<OnboardingStatusResponse>('/onboarding/lighting-complete', {});
}

/** Replays the whole first-run sequence, import steps included where still detected. */
export async function resetOnboarding() {
  return postService<OnboardingStatusResponse>('/onboarding/reset', {});
}

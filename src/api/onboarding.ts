import { fetchService, postService } from './service';

export interface OnboardingStatusResponse {
  completed: boolean;
}

export async function fetchOnboardingStatus() {
  return fetchService<OnboardingStatusResponse>('/onboarding');
}

export async function completeOnboarding() {
  return postService<OnboardingStatusResponse>('/onboarding/complete', {});
}

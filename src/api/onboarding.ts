import { fetchService, postService } from './service';

export interface OnboardingStatusResponse {
  completed: boolean;
  /** Absent on services that predate the lighting onboarding screen. */
  lightingCompleted?: boolean;
  /** Absent on services that predate the feature-pillars onboarding screen. */
  featuresCompleted?: boolean;
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

export async function completeFeaturesOnboarding() {
  return postService<OnboardingStatusResponse>('/onboarding/features-complete', {});
}

export type ConflictStepAction = 'resolveAll' | 'skip' | 'skipOnboarding';

/** How the user left the onboarding conflict step, as catalog ids. */
export interface ConflictStepReport {
  action: ConflictStepAction;
  listed: string[];
  whitelisted: string[];
  /** Rows already gone when the user chose: ended here, closed elsewhere, or exited. */
  alreadyEnded: string[];
}

/** Log-only: writes the choice to the service log for support bundles. */
export async function reportConflictStep(report: ConflictStepReport) {
  return postService<OnboardingStatusResponse>('/onboarding/conflicts-step', report);
}

export interface PanelSwipeOnboardingResponse {
  completed: boolean;
  // Absent from a service that predates the immersive hint.
  immersiveCompleted?: boolean;
}

/** Touch-panel swipe-up hint flag; panel-reachable, unlike the flags above. */
export async function fetchPanelSwipeOnboarding() {
  return fetchService<PanelSwipeOnboardingResponse>('/onboarding/panel-swipe');
}

export async function completePanelSwipeOnboarding() {
  return postService<PanelSwipeOnboardingResponse>('/onboarding/panel-swipe/complete', {});
}

export async function completeImmersiveSwipeOnboarding() {
  return postService<PanelSwipeOnboardingResponse>('/onboarding/panel-swipe/immersive/complete', {});
}

/** Replays the whole first-run sequence, import steps included where still detected. */
export async function resetOnboarding() {
  return postService<OnboardingStatusResponse>('/onboarding/reset', {});
}

export interface DashboardBannerResponse {
  dismissedKey: string;
}

/** Key of the home-dashboard banner the user last closed or opened. */
export async function fetchDashboardBanner() {
  return fetchService<DashboardBannerResponse>('/onboarding/banner');
}

export async function dismissDashboardBanner(key: string) {
  return postService<DashboardBannerResponse>(`/onboarding/banner/dismiss/${encodeURIComponent(key)}`, {});
}

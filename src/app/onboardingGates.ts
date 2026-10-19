export interface OnboardingGateInputs {
  /** Pillar values exist, or the service was down at some point in this page load. Only the dashboard uses it. */
  stickyReady: boolean;
  /** Pillar values exist right now, or the service is down right now. The gates wait on this. */
  liveReady: boolean;
  /** The Nexus 2 preview answer that decides the import step is still in flight. */
  importUndecided: boolean;
  statusKnown: boolean;
  nexus2Known: boolean;
  fanControlKnown: boolean;
  welcomeOpen: boolean;
  featuresOpen: boolean;
  /** The welcome step is completed or dismissed. */
  welcomeDone: boolean;
  importOffered: boolean;
  importDismissed: boolean;
  ranEarlierGate: boolean;
  conflictStepDone: boolean;
  lightingFeatureOff: boolean;
  lightingPending: boolean;
  lightingDismissed: boolean;
}

export interface OnboardingGates {
  importOpen: boolean;
  conflictStepPending: boolean;
  lightingOnboardingOpen: boolean;
  showDashboard: boolean;
  /** Any step or the dashboard is showing: from here the pillar values stay frozen. */
  gateOpened: boolean;
}

/**
 * Which onboarding gate is open and whether the dashboard shows. The gates
 * wait on live readiness, so with the service reachable the import decision
 * never uses pillar values it does not have yet; the dashboard alone keeps
 * the sticky form, so a service that was down at load never blanks the app.
 */
export function deriveOnboardingGates(i: OnboardingGateInputs): OnboardingGates {
  const known = i.statusKnown && i.nexus2Known && i.fanControlKnown;
  const importOpen = i.liveReady && !i.importUndecided && known
    && i.welcomeDone && !i.welcomeOpen && !i.featuresOpen && i.importOffered && !i.importDismissed;
  const conflictStepPending = i.liveReady && !i.importUndecided && known
    && i.ranEarlierGate && !i.welcomeOpen && !i.featuresOpen && !importOpen && !i.conflictStepDone;
  const lightingOnboardingOpen = i.liveReady && !i.importUndecided && known
    && !i.welcomeOpen && !importOpen && !i.featuresOpen && !conflictStepPending && !i.lightingFeatureOff
    && i.lightingPending && !i.lightingDismissed;
  const showDashboard = i.stickyReady && !i.importUndecided && known
    && !i.welcomeOpen && !i.featuresOpen && !lightingOnboardingOpen && !importOpen && !conflictStepPending;
  const gateOpened = i.welcomeOpen || i.featuresOpen || importOpen || conflictStepPending || lightingOnboardingOpen || showDashboard;
  return { importOpen, conflictStepPending, lightingOnboardingOpen, showDashboard, gateOpened };
}

/**
 * The informational HYTE step sits before Features and shows only while
 * HYTE Nexus 2 is installed now. `nexus2Installed` must be the service's
 * `detected` flag: `pending` and `importAvailable` outlive an uninstall.
 */
export function isHyteStepAvailable(i: {
  featuresPending: boolean;
  featuresReplay: boolean;
  nexus2Known: boolean;
  nexus2Installed: boolean;
}): boolean {
  return i.featuresPending && !i.featuresReplay && i.nexus2Known && i.nexus2Installed;
}

/**
 * The two gates between Welcome and Import. Features waits on the Nexus 2
 * read so it never flashes before the HYTE step, and yields to it while it is open.
 */
export function deriveEarlyGates(i: {
  featuresPending: boolean;
  featuresReplay: boolean;
  nexus2Known: boolean;
  nexus2Installed: boolean;
  hyteDismissed: boolean;
}): { hyteStepAvailable: boolean; hyteOpen: boolean; featuresOpen: boolean } {
  const hyteStepAvailable = isHyteStepAvailable(i);
  const hyteOpen = hyteStepAvailable && !i.hyteDismissed;
  return { hyteStepAvailable, hyteOpen, featuresOpen: i.featuresPending && i.nexus2Known && !hyteOpen };
}

/**
 * Whether a new onboarding read re-opens the HYTE step. Only a reset re-pends
 * Welcome; a reconnect after Welcome (Features still pending) must not.
 */
export function shouldReopenHyte(i: { welcomeStatus: 'unknown' | 'pending' | 'completed' }): boolean {
  return i.welcomeStatus === 'pending';
}

/** Where Back goes from Features: the HYTE step when it ran, else Welcome while that is part of this run. */
export function featuresBackTarget(i: { hyteStepAvailable: boolean; welcomePending: boolean }): 'hyte' | 'welcome' | null {
  if (i.hyteStepAvailable) return 'hyte';
  return i.welcomePending ? 'welcome' : null;
}

/** Where Back goes from the HYTE step. */
export function hyteBackTarget(i: { welcomePending: boolean }): 'welcome' | null {
  return i.welcomePending ? 'welcome' : null;
}

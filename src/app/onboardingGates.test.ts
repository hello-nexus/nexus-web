import { describe, expect, it } from 'vitest';
import { deriveOnboardingGates, isHyteStepAvailable, isLightingStepShown, onboardingStepIndicator, type OnboardingGateInputs } from './onboardingGates';

// A returning launch: onboarding done, nothing pending, everything resolved.
const base: OnboardingGateInputs = {
  stickyReady: true, liveReady: true, importUndecided: false,
  statusKnown: true, nexus2Known: true, fanControlKnown: true,
  welcomeOpen: false, featuresOpen: false, welcomeDone: true,
  importOffered: false, importDismissed: false, ranEarlierGate: false,
  conflictStepDone: false, lightingFeatureOff: false, lightingPending: false, lightingDismissed: false,
};
const gates = (over: Partial<OnboardingGateInputs> = {}) => deriveOnboardingGates({ ...base, ...over });

describe('deriveOnboardingGates', () => {
  it('shows the dashboard when nothing is pending', () => {
    expect(gates()).toMatchObject({ showDashboard: true, importOpen: false, conflictStepPending: false, lightingOnboardingOpen: false });
  });

  it('opens the import gate and hides the dashboard when an offer is pending', () => {
    expect(gates({ importOffered: true })).toMatchObject({ importOpen: true, showDashboard: false });
  });

  it('keeps the import closed while the pillar values are unknown with the service reachable', () => {
    // Cooling off on the server, FanControl pending, prefs not answered yet: liveReady is false.
    const g = gates({ importOffered: true, liveReady: false, stickyReady: true });
    expect(g.importOpen).toBe(false);
    expect(g.conflictStepPending).toBe(false);
    expect(g.lightingOnboardingOpen).toBe(false);
  });

  it('still shows the dashboard on the sticky readiness, so a service that was down never blanks the app', () => {
    expect(gates({ liveReady: false, stickyReady: true }).showDashboard).toBe(true);
  });

  it('waits on neither form of readiness before values exist', () => {
    expect(gates({ liveReady: false, stickyReady: false }).showDashboard).toBe(false);
  });

  it('holds the dashboard and every gate while the Nexus 2 preview decides the import step', () => {
    const g = gates({ importUndecided: true, importOffered: true, lightingPending: true });
    expect(g).toMatchObject({ importOpen: false, conflictStepPending: false, lightingOnboardingOpen: false, showDashboard: false, gateOpened: false });
  });

  it('opens the lighting step last, once the import and conflict steps are past', () => {
    expect(gates({ lightingPending: true })).toMatchObject({ lightingOnboardingOpen: true, showDashboard: false });
    expect(gates({ lightingPending: true, importOffered: true }).lightingOnboardingOpen).toBe(false);
  });

  it('opens the conflict step only when an earlier gate ran this session', () => {
    expect(gates({ ranEarlierGate: true })).toMatchObject({ conflictStepPending: true, showDashboard: false });
    expect(gates({ ranEarlierGate: true, conflictStepDone: true }).conflictStepPending).toBe(false);
  });

  it('runs no gate while the welcome or features step is open', () => {
    expect(gates({ featuresOpen: true, importOffered: true })).toMatchObject({ importOpen: false, showDashboard: false });
    expect(gates({ welcomeOpen: true, lightingPending: true }).lightingOnboardingOpen).toBe(false);
  });

  it('shows the dashboard (the run is over) only when every gate is closed', () => {
    for (const over of [{ importOffered: true }, { ranEarlierGate: true }, { lightingPending: true }, { featuresOpen: true }]) {
      expect(gates(over).showDashboard).toBe(false);
    }
    expect(gates().showDashboard).toBe(true);
  });

  it('waits for the status reads', () => {
    expect(gates({ statusKnown: false }).showDashboard).toBe(false);
    expect(gates({ fanControlKnown: false, importOffered: true }).importOpen).toBe(false);
  });

  it('reports a gate as opened once the dashboard shows, so the pillar values freeze', () => {
    expect(gates()).toMatchObject({ showDashboard: true, gateOpened: true });
    expect(gates({ liveReady: false, stickyReady: false }).gateOpened).toBe(false);
    expect(gates({ importOffered: true }).gateOpened).toBe(true);
  });
});

describe('isHyteStepAvailable', () => {
  const ok = { featuresPending: true, featuresReplay: false, nexus2Known: true, nexus2Installed: true };

  it('is available while Nexus 2 is installed and Features is next', () => {
    expect(isHyteStepAvailable(ok)).toBe(true);
  });

  it('is not available when Nexus 2 is not installed', () => {
    expect(isHyteStepAvailable({ ...ok, nexus2Installed: false })).toBe(false);
  });

  it('is not available before the Nexus 2 status is known', () => {
    expect(isHyteStepAvailable({ ...ok, nexus2Known: false })).toBe(false);
  });

  it('is not available on a Features replay or when Features is not pending', () => {
    expect(isHyteStepAvailable({ ...ok, featuresReplay: true })).toBe(false);
    expect(isHyteStepAvailable({ ...ok, featuresPending: false })).toBe(false);
  });
});

describe('onboardingStepIndicator', () => {
  const all = { welcome: true, hyte: true, features: true, import: true, conflicts: true, lighting: true };

  it('counts every step when all show', () => {
    expect(onboardingStepIndicator(all, 'hyte')).toEqual({ total: 6, active: 1 });
  });

  it('drops the import step when none is offered', () => {
    expect(onboardingStepIndicator({ ...all, import: false }, 'hyte')).toEqual({ total: 5, active: 1 });
  });

  it('drops the conflicts step when it is spent', () => {
    expect(onboardingStepIndicator({ ...all, conflicts: false }, 'hyte')).toEqual({ total: 5, active: 1 });
  });

  it('drops the lighting step when lighting is disabled', () => {
    const lighting = isLightingStepShown({ lightingFeatureOff: true, lightingPending: true, lightingDismissed: false });
    expect(lighting).toBe(false);
    expect(onboardingStepIndicator({ ...all, lighting }, 'hyte')).toEqual({ total: 5, active: 1 });
  });

  it('moves the active index when welcome is not part of the run', () => {
    expect(onboardingStepIndicator({ ...all, welcome: false }, 'hyte')).toEqual({ total: 5, active: 0 });
  });

  it('ends fully filled on the last step', () => {
    expect(onboardingStepIndicator(all, 'lighting')).toEqual({ total: 6, active: 5 });
    expect(onboardingStepIndicator({ ...all, lighting: false }, 'conflicts')).toEqual({ total: 5, active: 4 });
  });

  it('numbers the same steps identically from every screen', () => {
    const shown = { ...all, import: false, hyte: true };
    const totals = (['welcome', 'hyte', 'features', 'conflicts', 'lighting'] as const).map(id => onboardingStepIndicator(shown, id).total);
    expect(new Set(totals).size).toBe(1);
  });
});

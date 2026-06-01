import { describe, expect, it } from 'vitest';
import { hasNewPairedSession } from './PairPhoneModal';

// hasNewPairedSession drives the re-mint of the single-use pair QR + manual
// code. It must fire ONLY on a genuine growth of the authorized-session set,
// because re-minting on the first load or on a revoke would needlessly churn
// the displayed token (or hide that the QR is still usable for a fresh device).
describe('hasNewPairedSession', () => {
  const set = (...ids: string[]) => new Set(ids);

  it('does not fire on the first observation (prev null)', () => {
    expect(hasNewPairedSession(null, set('a', 'b'))).toBe(false);
    expect(hasNewPairedSession(null, set())).toBe(false);
  });

  it('fires when a new id appears (count grows)', () => {
    expect(hasNewPairedSession(set('a'), set('a', 'b'))).toBe(true);
    expect(hasNewPairedSession(set(), set('a'))).toBe(true);
  });

  it('does not fire when membership is unchanged', () => {
    expect(hasNewPairedSession(set('a', 'b'), set('a', 'b'))).toBe(false);
    expect(hasNewPairedSession(set(), set())).toBe(false);
  });

  it('does not fire on a pure revoke / decrease', () => {
    expect(hasNewPairedSession(set('a', 'b'), set('a'))).toBe(false);
    expect(hasNewPairedSession(set('a'), set())).toBe(false);
  });

  it('fires on a churn where a new id replaces a revoked one (net new device)', () => {
    // 'a' was revoked and 'c' paired in the same poll window: 'c' is genuinely
    // new and consumed the on-screen token, so a re-mint is correct.
    expect(hasNewPairedSession(set('a', 'b'), set('b', 'c'))).toBe(true);
  });
});

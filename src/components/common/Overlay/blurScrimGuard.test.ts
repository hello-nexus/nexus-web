import { describe, it, expect, afterEach } from 'vitest';
import { acquireBlurScrim, releaseBlurScrim, blurScrimCount, resetBlurScrimForTests } from './blurScrimGuard';

const hasClass = () => document.documentElement.classList.contains('nexus-blur-scrim');

afterEach(() => resetBlurScrimForTests());

describe('blurScrimGuard', () => {
  it('marks the document while a scrim is open', () => {
    expect(hasClass()).toBe(false);
    acquireBlurScrim();
    expect(hasClass()).toBe(true);
    releaseBlurScrim();
    expect(hasClass()).toBe(false);
  });

  it('keeps the mark until the last stacked scrim releases', () => {
    acquireBlurScrim();
    acquireBlurScrim();
    releaseBlurScrim();
    expect(hasClass()).toBe(true);
    expect(blurScrimCount()).toBe(1);
    releaseBlurScrim();
    expect(hasClass()).toBe(false);
  });

  it('does not underflow on an unbalanced release', () => {
    releaseBlurScrim();
    expect(blurScrimCount()).toBe(0);
    acquireBlurScrim();
    expect(hasClass()).toBe(true);
  });
});

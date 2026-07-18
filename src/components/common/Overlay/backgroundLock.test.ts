import { beforeEach, describe, expect, it } from 'vitest';
import { backgroundLockCount, lockBackground, resetBackgroundLockForTests, unlockBackground } from './backgroundLock';

describe('backgroundLock', () => {
  beforeEach(() => {
    resetBackgroundLockForTests();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('locks scroll and hides the app root on the first lock', () => {
    lockBackground();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.getElementById('root')?.getAttribute('aria-hidden')).toBe('true');
    expect(backgroundLockCount()).toBe(1);
  });

  it('stays locked while a nested modal holds a second lock', () => {
    lockBackground();
    lockBackground();
    expect(backgroundLockCount()).toBe(2);

    unlockBackground();
    expect(backgroundLockCount()).toBe(1);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.getElementById('root')?.getAttribute('aria-hidden')).toBe('true');

    unlockBackground();
    expect(backgroundLockCount()).toBe(0);
    expect(document.body.style.overflow).toBe('');
    expect(document.getElementById('root')?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('restores a pre-existing aria-hidden value instead of clearing it', () => {
    document.getElementById('root')?.setAttribute('aria-hidden', 'false');
    lockBackground();
    unlockBackground();
    expect(document.getElementById('root')?.getAttribute('aria-hidden')).toBe('false');
  });

  it('does not go negative when unlocked more times than locked', () => {
    unlockBackground();
    unlockBackground();
    expect(backgroundLockCount()).toBe(0);
  });
});

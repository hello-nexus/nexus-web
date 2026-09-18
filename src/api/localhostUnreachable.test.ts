// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isLocalhostUnreachable, isRemoteOrigin, setForceLanMode } from './service';

// jsdom serves the module from a non-service port, which service.ts
// reads as a remote origin - the same footing as my.hellonexus.com. The
// desktop-only surfaces (Stream Deck, the panel-device helpers) key off this
// single predicate, so the website's detected-desktop mode flips them all.
describe('isLocalhostUnreachable', () => {
  afterEach(() => setForceLanMode(false));

  it('fails closed on a remote origin until forceLanMode is on', () => {
    expect(isRemoteOrigin).toBe(true);
    expect(isLocalhostUnreachable()).toBe(true);
    setForceLanMode(true);
    expect(isLocalhostUnreachable()).toBe(false);
  });
});

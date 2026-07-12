import { afterEach, describe, expect, it, vi } from 'vitest';

const getCachedAccountMock = vi.fn();
vi.mock('../../api/directApiBackend', () => ({
  getCachedAccount: () => getCachedAccountMock(),
}));

import { resolvePostAuthPath } from './postAuthRedirect';

const realLocation = window.location;
function stubHostname(hostname: string): void {
  Object.defineProperty(window, 'location', {
    value: { hostname, href: `https://${hostname}/` },
    configurable: true,
  });
}

describe('resolvePostAuthPath', () => {
  afterEach(() => {
    Object.defineProperty(window, 'location', { value: realLocation, configurable: true });
    getCachedAccountMock.mockReset();
  });

  it('lands on the dashboard root for a my.* host, regardless of the cached account', () => {
    stubHostname('my.hellonexus.com');
    getCachedAccountMock.mockReturnValue({ username: 'alpha' });

    expect(resolvePostAuthPath()).toBe('/');
  });

  it('is case-insensitive on the my. prefix', () => {
    stubHostname('My.HelloNexus.com');
    getCachedAccountMock.mockReturnValue({ username: 'alpha' });

    expect(resolvePostAuthPath()).toBe('/');
  });

  it('lands on the public profile for the bare marketing host', () => {
    stubHostname('hellonexus.com');
    getCachedAccountMock.mockReturnValue({ username: 'alpha' });

    expect(resolvePostAuthPath()).toBe('/u/alpha');
  });

  it('percent-encodes an unusual username', () => {
    stubHostname('hellonexus.com');
    getCachedAccountMock.mockReturnValue({ username: 'a b/c' });

    expect(resolvePostAuthPath()).toBe('/u/a%20b%2Fc');
  });

  it('falls back to the marketing root on the bare host when no account is cached yet', () => {
    stubHostname('hellonexus.com');
    getCachedAccountMock.mockReturnValue(null);

    expect(resolvePostAuthPath()).toBe('/');
  });
});

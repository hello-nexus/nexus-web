import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PairRedirect } from './PairRedirect';

const setRelayRegionMock = vi.fn();
vi.mock('./api/service', () => ({
  isRemoteOrigin: true,
  setRelayRegion: (...args: unknown[]) => setRelayRegionMock(...args),
}));

const pairOverRelayClaimMock = vi.fn(() => new Promise(() => {}));
vi.mock('./api/internetPairing', () => ({
  pairOverInternet: vi.fn(),
  pairOverRelayClaim: (...args: unknown[]) => pairOverRelayClaimMock(...args),
}));

const upsertPairedPcMock = vi.fn();
vi.mock('./api/pairedPcs', () => ({
  upsertPairedPc: (...args: unknown[]) => upsertPairedPcMock(...args),
}));

function setLocationSearch(search: string) {
  window.history.pushState({}, '', `/r/pair${search}`);
}

// jsdom has no real navigation; capture the Tier-1 `location.href = url`
// assignment so tests can assert the redirect target. jsdom's Location
// getters are brand-checked, so the stub snapshots plain values instead of
// prototype-delegating. Restored in afterEach; call AFTER setLocationSearch.
const realLocation = window.location;
function spyOnLocationHref(): () => string {
  let captured = '';
  const stub = {
    search: realLocation.search,
    pathname: realLocation.pathname,
    origin: realLocation.origin,
    protocol: realLocation.protocol,
    host: realLocation.host,
    hostname: realLocation.hostname,
    port: realLocation.port,
    replace: (v: string) => { captured = v; },
    assign: (v: string) => { captured = v; },
    get href() { return captured || 'http://localhost/'; },
    set href(v: string) { captured = v; },
  };
  Object.defineProperty(window, 'location', { value: stub, configurable: true });
  return () => captured;
}

// PairRedirect.tsx is mounted outside I18nProvider (see the file's own note),
// so its spinner wrapper is verified by inline style rather than i18n copy.
describe('PairRedirect', () => {
  beforeEach(() => {
    setRelayRegionMock.mockClear();
    upsertPairedPcMock.mockClear();
    pairOverRelayClaimMock.mockClear();
    pairOverRelayClaimMock.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: realLocation, configurable: true });
    window.history.pushState({}, '', '/');
  });

  it('centers the spinner (flex row, justify-content center) in the lan phase on a remote origin', () => {
    setLocationSearch('?host=192.168.1.50&pair=abc123&httpPort=9400');
    render(<PairRedirect />);

    const spinner = screen.getByRole('img', { name: 'common.loading' });
    expect(spinner).toBeInTheDocument();
    const wrapper = spinner.parentElement as HTMLElement;
    expect(wrapper.style.display).toBe('flex');
    expect(wrapper.style.justifyContent).toBe('center');
    expect(setRelayRegionMock).toHaveBeenCalledWith('');
  });

  it('renders no spinner (and no wrapper) for an invalid pairing link', () => {
    setLocationSearch('?pair=abc123');
    render(<PairRedirect />);

    expect(screen.queryByRole('img', { name: 'common.loading' })).toBeNull();
    expect(screen.getByText('Invalid pairing link')).toBeInTheDocument();
  });

  it('forwards the QR fp param into the LAN redirect URL for the same-origin claim to pick up', () => {
    setLocationSearch('?host=192.168.1.50&pair=abc123&httpPort=9400&fp=AA:BB:CC');
    const assigned = spyOnLocationHref();
    render(<PairRedirect />);

    expect(assigned()).toContain('&fp=AA%3ABB%3ACC');
  });

  it('omits the fp query param entirely when the QR carries none', () => {
    setLocationSearch('?host=192.168.1.50&pair=abc123&httpPort=9400');
    const assigned = spyOnLocationHref();
    render(<PairRedirect />);

    expect(assigned()).not.toContain('fp=');
  });

  it('shows only the centered spinner in the lan phase (no manual fallback link)', () => {
    setLocationSearch('?host=192.168.1.50&pair=abc123&httpPort=9400');
    spyOnLocationHref();
    render(<PairRedirect />);

    expect(screen.getByRole('img', { name: 'common.loading' })).toBeInTheDocument();
    expect(document.querySelector('a')).toBeNull();
  });

  it('persists a paired-PC record with the relay result once the direct-LAN probe times out', async () => {
    vi.useFakeTimers();
    pairOverRelayClaimMock.mockResolvedValue({
      kind: 'relay', token: 'relay-token', machineName: 'Tower', spki: 'AA:BB',
    });
    setLocationSearch('?host=192.168.1.50&pair=abc123&httpPort=9400&r=ap');
    render(<PairRedirect />);

    await vi.advanceTimersByTimeAsync(3000);
    // Flush the microtask the relay-claim promise resolves on.
    await vi.advanceTimersByTimeAsync(0);

    expect(upsertPairedPcMock).toHaveBeenCalledWith({
      machineName: 'Tower',
      token: 'relay-token',
      spki: 'AA:BB',
      relayRegion: 'ap',
    });
    vi.useRealTimers();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PairRedirect } from './PairRedirect';

const setRelayRegionMock = vi.fn();
vi.mock('./api/service', () => ({
  isRemoteOrigin: true,
  setRelayRegion: (...args: unknown[]) => setRelayRegionMock(...args),
}));

vi.mock('./api/internetPairing', () => ({
  pairOverInternet: vi.fn(),
  pairOverRelayClaim: vi.fn(() => new Promise(() => {})),
}));

function setLocationSearch(search: string) {
  window.history.pushState({}, '', `/r/pair${search}`);
}

// PairRedirect.tsx is mounted outside I18nProvider (see the file's own note),
// so its spinner wrapper is verified by inline style rather than i18n copy.
describe('PairRedirect', () => {
  beforeEach(() => {
    setRelayRegionMock.mockClear();
  });

  afterEach(() => {
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
});

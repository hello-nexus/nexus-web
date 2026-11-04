import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const pairMock = vi.fn();
vi.mock('./api/internetPairing', () => ({
  pairOverInternet: (...args: unknown[]) => pairMock(...args),
  pairOverRelayClaim: vi.fn(),
}));
vi.mock('./api/service', () => ({ isRemoteOrigin: false, setRelayRegion: vi.fn() }));
vi.mock('./lib/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { PairRedirect } from './PairRedirect';

beforeEach(() => {
  window.history.replaceState(null, '', '/r/pair?host=192.168.1.5&pair=tok');
  pairMock.mockReset();
});
afterEach(() => { window.history.replaceState(null, '', '/'); });

describe('PairRedirect approval states', () => {
  it('shows the number and a cancel button while the PC decides, then a neutral cancelled screen', async () => {
    let finish: (v: unknown) => void = () => {};
    pairMock.mockImplementation((params: { onApproval: (p: { sas: string }) => void }) => {
      params.onApproval({ sas: '123 456' });
      return new Promise(resolve => { finish = resolve; });
    });
    render(<PairRedirect />);
    expect(await screen.findByText('123 456')).toBeTruthy();
    expect(screen.getByText('panel.gate.approval.headline')).toBeTruthy();
    await act(async () => { finish({ kind: 'rejected', error: 'cancelled' }); });
    expect(await screen.findByText('pairRedirect.cancelledHeadline')).toBeTruthy();
    expect(screen.queryByText('panel.gate.fail.expiredHeadline')).toBeNull();
  });

  it('shows the denied message when the PC refuses', async () => {
    pairMock.mockResolvedValue({ kind: 'rejected', error: 'denied' });
    render(<PairRedirect />);
    expect(await screen.findByText('panel.gate.fail.deniedHeadline')).toBeTruthy();
  });

  it('shows the busy message for code-in-use', async () => {
    pairMock.mockResolvedValue({ kind: 'rejected', error: 'code-in-use' });
    render(<PairRedirect />);
    expect(await screen.findByText('panel.gate.fail.busyHeadline')).toBeTruthy();
  });
});

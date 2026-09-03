import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelLoadingGate, connectingTarget } from './PanelLoadingGate';

const PC = {
  id: 'pc-1',
  machineName: 'HYTEY70',
  token: 't',
  host: '192.168.1.212',
  httpPort: '9400',
  lastConnectedAt: 1,
};

// Counts calls because listPairedPcs runs the legacy migration, which
// SYNTHESIZES a nameless paired-PC record from any stored session token. A
// kiosk holds one, so touching the store there invents a PC.
const listPairedPcsMock = vi.fn(() => pcs);

vi.mock('../api/pairedPcs', () => ({
  getActivePcId: () => activeId,
  listPairedPcs: () => listPairedPcsMock(),
}));

let activeId: string | null = null;
let pcs: (typeof PC)[] = [];

beforeEach(() => {
  activeId = PC.id;
  pcs = [PC];
  listPairedPcsMock.mockClear();
});

afterEach(() => {
  delete (window as { nexusNative?: unknown }).nexusNative;
});

describe('connectingTarget', () => {
  it('never touches the paired-PC store off the phone surface', () => {
    // The store read is not merely useless on a kiosk, it is harmful: it
    // would create the phantom record it then displayed.
    for (const surface of ['y70', 'q60', 'desktop'] as const) {
      expect(connectingTarget(surface, 'Unnamed PC')).toBeNull();
    }
    expect(listPairedPcsMock).not.toHaveBeenCalled();
  });

  it('falls back to the unnamed label, since a migrated record has no name', () => {
    pcs = [{ ...PC, machineName: '' }];
    expect(connectingTarget('phone', 'Unnamed PC')?.name).toBe('Unnamed PC');
  });

  it('shows the origin on the LAN, where the panel is served by the PC', () => {
    expect(connectingTarget('phone', 'Unnamed PC')?.host).toBe(window.location.host);
  });

  it('shows no address over the relay, where the origin is the cloud', () => {
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location, hostname: 'hellonexus.com', host: 'hellonexus.com',
    } as Location);
    expect(connectingTarget('phone', 'Unnamed PC')?.host).toBe('');
    vi.restoreAllMocks();
  });
});

describe('PanelLoadingGate', () => {
  it('names the PC and offers Cancel on the first frame, matching the native screen', () => {
    // The screen the native ConnectionLoadingView hands the viewport to. It
    // used to be a bare spinner, so one connect showed two unrelated screens
    // and the second had no way out.
    const findComputer = vi.fn();
    (window as { nexusNative?: { findComputer: () => void } }).nexusNative = { findComputer };

    render(<PanelLoadingGate surface="phone" />);

    expect(screen.getByText('panel.gate.connectingTo')).toBeInTheDocument();
    expect(screen.getByText(window.location.host)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'panel.gate.cancel' }));
    expect(findComputer).toHaveBeenCalledTimes(1);
  });

  it('stays a bare spinner on a kiosk panel, which has no PC to name or leave', () => {
    (window as { nexusNative?: { findComputer: () => void } }).nexusNative = { findComputer: vi.fn() };

    render(<PanelLoadingGate surface="y70" />);

    expect(screen.queryByText('panel.gate.connectingTo')).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.gate.cancel' })).toBeNull();
  });

  it('hides Cancel outside the native app, which has no find-computer surface', () => {
    render(<PanelLoadingGate surface="phone" />);
    expect(screen.queryByRole('button', { name: 'panel.gate.cancel' })).toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PairedPcsContent } from './PairedPcsContent';
import { upsertPairedPc, activatePairedPc, markActivePcNeedsRepair } from '../../../api/pairedPcs';

const TOKEN_KEY = 'nexus_token';

/** The wrapper's find-computer bridge, which gates every pairing affordance
 *  here (a bare /r/pair link is an invalid-link dead end). */
function setNativeBridge() {
  const findComputer = vi.fn();
  (window as { nexusNative?: { findComputer: () => void } }).nexusNative = { findComputer };
  return findComputer;
}

describe('PairedPcsContent', () => {
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    delete (window as { nexusNative?: unknown }).nexusNative;
    assignSpy = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign: assignSpy });
  });

  it('shows the empty state when no PC has ever been paired', () => {
    render(<PairedPcsContent />);
    expect(screen.getByText('pairedPcs.empty')).toBeInTheDocument();
  });

  it('offers a Pair a new PC action when the list is empty', () => {
    const findComputer = setNativeBridge();
    render(<PairedPcsContent />);
    fireEvent.click(screen.getByText('connection.lost.newDevice'));
    expect(findComputer).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[href="/r/pair"]')).toBeNull();
  });

  it('still offers the Pair a new PC action alongside a non-empty list', () => {
    setNativeBridge();
    upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA' });
    render(<PairedPcsContent />);
    expect(screen.getByText('connection.lost.newDevice')).toBeInTheDocument();
    expect(screen.getByText('Tower')).toBeInTheDocument();
  });

  it('hides the Pair a new PC action outside the native app', () => {
    // A bare /r/pair link lands on PairRedirect's invalid-link page, so there
    // is nothing to offer without the wrapper's QR scanner.
    render(<PairedPcsContent />);
    expect(screen.queryByText('connection.lost.newDevice')).toBeNull();
    expect(document.querySelector('a[href="/r/pair"]')).toBeNull();
  });

  it('lists every stored PC by machine name', () => {
    upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA' });
    upsertPairedPc({ machineName: 'Laptop', token: 't2', spki: 'BB' });

    render(<PairedPcsContent />);

    expect(screen.getByText('Tower')).toBeInTheDocument();
    expect(screen.getByText('Laptop')).toBeInTheDocument();
  });

  it('falls back to a placeholder name for a record with no machine name', () => {
    upsertPairedPc({ token: 't1', spki: 'AA' });
    render(<PairedPcsContent />);
    expect(screen.getByText('pairedPcs.unnamed')).toBeInTheDocument();
  });

  it('marks the active record as connected, with no connect button', () => {
    const record = upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA' });
    activatePairedPc(record.id);

    render(<PairedPcsContent />);

    expect(screen.getByText('pairedPcs.statusConnected')).toBeInTheDocument();
    expect(screen.queryByText('pairedPcs.connect')).toBeNull();
  });

  it('connecting a non-active record applies its token and navigates to /panel/phone', () => {
    upsertPairedPc({ machineName: 'Tower', token: 'live-token', spki: 'AA' });
    // upsertPairedPc also marks its own result active - pair a second PC so
    // the first is no longer the active one, giving it a real Connect button.
    upsertPairedPc({ machineName: 'Laptop', token: 't2', spki: 'BB' });

    render(<PairedPcsContent />);

    fireEvent.click(screen.getAllByText('pairedPcs.connect')[0]);

    expect(localStorage.getItem(TOKEN_KEY)).toBe('live-token');
    expect(assignSpy).toHaveBeenCalledWith('/panel/phone');
  });

  it('shows a re-pair link instead of a connect button for a needsRepair record', () => {
    const findComputer = setNativeBridge();
    const record = upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA' });
    activatePairedPc(record.id);
    markActivePcNeedsRepair();
    // A third, currently-inactive PC gets a real Connect button - proves the
    // needsRepair record's missing Connect button is specific to it, not a
    // side effect of nothing being connectable in this render.
    upsertPairedPc({ machineName: 'Laptop', token: 't2', spki: 'BB' });
    upsertPairedPc({ machineName: 'Desktop', token: 't3', spki: 'CC' });

    render(<PairedPcsContent />);

    expect(screen.getByText('pairedPcs.statusNeedsRepair')).toBeInTheDocument();
    fireEvent.click(screen.getByText('connection.sessionRevoked.pairAgain'));
    expect(findComputer).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[href="/r/pair"]')).toBeNull();
    expect(screen.queryAllByText('pairedPcs.connect')).toHaveLength(1); // only Laptop's
  });

  it('removing a record drops it from the list immediately', () => {
    upsertPairedPc({ machineName: 'Tower', token: 't1', spki: 'AA' });

    render(<PairedPcsContent />);
    expect(screen.getByText('Tower')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('pairedPcs.remove'));

    expect(screen.queryByText('Tower')).toBeNull();
    expect(screen.getByText('pairedPcs.empty')).toBeInTheDocument();
  });
});

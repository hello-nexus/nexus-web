import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConflictDevice } from '../../../hooks/useConflictDevices';
import { ConflictOutcomePanel } from './ConflictOutcomePanel';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      (params ? `${key}:${Object.values(params).join('|')}` : key),
  }),
}));

const mockKill = vi.fn();
const mockWhitelist = vi.fn();
const mockDisableAutostart = vi.fn();
const mockFetchAutostart = vi.fn();
vi.mock('../../../api/conflicts', () => ({
  HYTE_NEXUS2_CONFLICT_ID: 'hyte-nexus-2',
  killConflict: (...args: any[]) => mockKill(...args),
  setConflictWhitelisted: (...args: any[]) => mockWhitelist(...args),
  fetchConflictAutostart: (...args: any[]) => mockFetchAutostart(...args),
  disableConflictAutostart: (...args: any[]) => mockDisableAutostart(...args),
}));
vi.mock('../../../api/migration', () => ({ uninstallNexus2: vi.fn().mockResolvedValue(null) }));

let mockDevices = new Map<string, ConflictDevice[]>();
const mockSetOwner = vi.fn();
vi.mock('../../../hooks/useConflictDevices', () => ({
  useConflictDevices: () => ({ devicesByApp: mockDevices, setOwner: mockSetOwner }),
}));

const razer = { id: 'razer', displayName: 'Razer Synapse', category: 'lighting', processName: 'RazerAppEngine', pid: 6304 };
const deck = { id: 'elgato', displayName: 'Stream Deck', category: 'peripherals', processName: 'StreamDeck', pid: 28496 };
const icue = { id: 'icue', displayName: 'iCUE', category: 'lighting', processName: 'iCUE.exe', pid: 11872 };

const onDone = vi.fn();

function renderPanel(whitelisted: string[] = [], conflicts = [razer, deck, icue]) {
  return render(
    <ConflictOutcomePanel
      conflicts={conflicts}
      ready
      active
      whitelisted={new Set(whitelisted)}
      variant="modal"
      heading={<p>heading</p>}
      onDone={onDone}
    />,
  );
}

const cardOf = (name: string) => screen.getByText(name).closest('[role="button"]') as HTMLElement;
const press = async (name: string) => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
};

beforeEach(() => {
  mockKill.mockReset().mockResolvedValue({ error: false, msg: 'Ok', killed: true });
  mockWhitelist.mockReset().mockResolvedValue({ error: false, msg: 'Ok' });
  mockDisableAutostart.mockReset().mockResolvedValue({ error: false, msg: 'Ok', disabled: 1 });
  mockFetchAutostart.mockReset().mockResolvedValue([
    { id: 'razer', entries: [{ kind: 'runKeyUser', entryName: 'Razer' }] },
  ]);
  mockSetOwner.mockReset().mockResolvedValue(true);
  onDone.mockReset();
  mockDevices = new Map([
    ['elgato', [{ key: 'd1', name: 'Stream Deck MK.2', owner: 'nexus' }]],
    ['icue', [{ key: 'd2', name: 'K70 RGB PRO', owner: 'app' }]],
  ]);
});

describe('ConflictOutcomePanel', () => {
  it('defaults to terminate, except an allowed app or one that owns its devices', async () => {
    renderPanel(['razer']);
    await act(async () => { await Promise.resolve(); });

    expect(cardOf('Razer Synapse')).toHaveAttribute('aria-pressed', 'false');
    expect(cardOf('Stream Deck')).toHaveAttribute('aria-pressed', 'true');
    expect(cardOf('iCUE')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByText('conflicts.outcome.willTerminate')).toHaveLength(1);
    expect(screen.getAllByText('conflicts.outcome.keepsRunning')).toHaveLength(2);
    expect(mockKill).not.toHaveBeenCalled();
  });

  it('has no column header row, and each outcome label carries its icon', () => {
    const { container } = renderPanel(['razer']);

    expect(screen.queryByText('conflicts.outcome.colApp')).toBeNull();
    expect(screen.queryByText('conflicts.outcome.colOutcome')).toBeNull();
    expect(container.querySelectorAll('svg.lucide-circle-x')).toHaveLength(1);
    expect(container.querySelectorAll('svg.lucide-circle-check')).toHaveLength(2);
  });

  it('a card click toggles the outcome, from the keyboard too', () => {
    renderPanel();

    fireEvent.click(cardOf('Razer Synapse'));
    expect(cardOf('Razer Synapse')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.keyDown(cardOf('Razer Synapse'), { key: 'Enter' });
    expect(cardOf('Razer Synapse')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(cardOf('Razer Synapse'), { key: ' ' });
    expect(cardOf('Razer Synapse')).toHaveAttribute('aria-pressed', 'false');
  });

  it('a card click moves the device switch back and forth', () => {
    renderPanel();
    const nexus = () => screen.getAllByRole('radio', { name: 'conflicts.devices.nexusControls' })[0];

    expect(nexus()).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(cardOf('Stream Deck'));
    expect(screen.getAllByRole('radio', { name: 'conflicts.devices.appControls:Stream Deck' })[0]).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(cardOf('Stream Deck'));
    expect(nexus()).toHaveAttribute('aria-checked', 'true');
  });

  it('clicking the switch sets the card, pins the switch, and later card clicks leave it', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('radio', { name: 'conflicts.devices.nexusControls' , hidden: false, checked: false }));
    expect(cardOf('iCUE')).toHaveAttribute('aria-pressed', 'true');
    expect(cardOf('Stream Deck')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(cardOf('iCUE'));
    expect(cardOf('iCUE')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByRole('radio', { name: 'conflicts.devices.nexusControls' })[1]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('conflicts.outcome.bothDrive')).toBeInTheDocument();
  });

  it('clicks on the switch and the startup checkbox do not toggle the card', async () => {
    renderPanel();
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByRole('checkbox', { name: 'conflicts.outcome.removeFromStartup' }));
    expect(cardOf('Razer Synapse')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getAllByRole('radio', { name: 'conflicts.devices.nexusControls' })[0]);
    expect(cardOf('Stream Deck')).toHaveAttribute('aria-pressed', 'true');
    expect(mockKill).not.toHaveBeenCalled();
  });

  it('the primary button applies every choice with the right ids and nothing before', async () => {
    renderPanel(['razer']);
    await act(async () => { await Promise.resolve(); });
    expect(mockKill).not.toHaveBeenCalled();
    expect(mockWhitelist).not.toHaveBeenCalled();

    fireEvent.click(cardOf('Razer Synapse'));
    await press('conflicts.outcome.terminate:2');

    expect(mockKill.mock.calls.map(c => c[0]).sort()).toEqual(['elgato', 'razer']);
    expect(mockWhitelist).toHaveBeenCalledWith('razer', false);
    expect(mockWhitelist).not.toHaveBeenCalledWith('elgato', expect.anything());
    expect(mockDisableAutostart).toHaveBeenCalledWith('razer');
    expect(mockSetOwner).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith('apply');
  });

  it('applies the device owner chosen through the switch', async () => {
    renderPanel();
    fireEvent.click(cardOf('Stream Deck'));
    await press('conflicts.outcome.terminateOne');

    expect(mockSetOwner).toHaveBeenCalledWith('elgato', 'app');
    expect(mockKill.mock.calls.map(c => c[0]).sort()).toEqual(['razer']);
  });

  it('leaves the boot entry when the startup box is unticked', async () => {
    renderPanel();
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('checkbox', { name: 'conflicts.outcome.removeFromStartup' }));
    await press('conflicts.outcome.terminate:2');

    expect(mockKill).toHaveBeenCalledWith('razer');
    expect(mockDisableAutostart).not.toHaveBeenCalled();
  });

  it('Keep all running allows every app not already allowed and ends none', async () => {
    renderPanel(['icue']);
    await press('conflicts.outcome.keepAll');

    expect(mockWhitelist.mock.calls.map(c => c[0]).sort()).toEqual(['elgato', 'razer']);
    expect(mockWhitelist.mock.calls.every(c => c[1] === true)).toBe(true);
    expect(mockKill).not.toHaveBeenCalled();
    expect(mockSetOwner).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith('keepAll');
  });

  it('shows Save when nothing is set to terminate', () => {
    renderPanel(['razer', 'elgato'], [razer, deck]);

    expect(screen.getByRole('button', { name: 'conflicts.outcome.save' })).toBeInTheDocument();
  });

  it('counts only rows a kill will be sent for', async () => {
    const { rerender } = renderPanel(['icue'], [razer, deck, icue]);
    expect(screen.getByRole('button', { name: 'conflicts.outcome.terminate:2' })).toBeInTheDocument();

    rerender(
      <ConflictOutcomePanel conflicts={[razer, icue]} ready active whitelisted={new Set(['icue'])} variant="modal" heading={<p>heading</p>} onDone={onDone} />,
    );
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByRole('button', { name: 'conflicts.outcome.terminateOne' })).toBeInTheDocument();
    await press('conflicts.outcome.terminateOne');
    expect(mockKill.mock.calls.map(c => c[0])).toEqual(['razer']);
  });

  it('a Nexus 2 row outside the uninstall card is fixed to terminate and not a toggle', async () => {
    const nexus2 = { id: 'hyte-nexus-2', displayName: 'HYTE Nexus 2', category: 'lighting', processName: 'HYTE Nexus', pid: 3268 };
    renderPanel([], [nexus2]);

    const row = screen.getByText('HYTE Nexus 2').closest('li') as HTMLElement;
    expect(row.querySelector('[role="button"]')).toBeNull();
    expect(row.querySelector('[aria-pressed]')).toBeNull();
    expect(screen.getByText('conflicts.outcome.willTerminate')).toBeInTheDocument();
    fireEvent.click(screen.getByText('conflicts.outcome.willTerminate'));
    expect(screen.getByText('conflicts.outcome.willTerminate')).toBeInTheDocument();

    await press('conflicts.outcome.terminateOne');
    expect(mockKill).toHaveBeenCalledWith('hyte-nexus-2');
    expect(mockWhitelist).not.toHaveBeenCalled();
  });

  describe('experimental hardware', () => {
    beforeEach(() => {
      mockDevices = new Map([['icue', [{ key: 'd2', name: 'Hub', owner: 'app', experimental: true }]]]);
    });
    const confirmKey = 'devices.experimental.confirm';

    it('asks once before the primary button hands it to Nexus, and cancel applies nothing', async () => {
      renderPanel([], [razer, icue]);
      fireEvent.click(cardOf('iCUE'));
      await press('conflicts.outcome.terminate:2');

      expect(screen.getByRole('button', { name: confirmKey })).toBeInTheDocument();
      expect(mockKill).not.toHaveBeenCalled();
      expect(mockSetOwner).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
      expect(screen.queryByRole('button', { name: confirmKey })).not.toBeInTheDocument();
      expect(mockKill).not.toHaveBeenCalled();
      expect(cardOf('iCUE')).toHaveAttribute('aria-pressed', 'true');
    });

    it('confirming applies the whole plan', async () => {
      renderPanel([], [razer, icue]);
      fireEvent.click(cardOf('iCUE'));
      await press('conflicts.outcome.terminate:2');
      await press(confirmKey);

      expect(mockSetOwner).toHaveBeenCalledWith('icue', 'nexus');
      expect(mockKill.mock.calls.map(c => c[0]).sort()).toEqual(['icue', 'razer']);
      expect(onDone).toHaveBeenCalledWith('apply');
    });

    it('a switch click asks at once, and the primary button then does not ask again', async () => {
      renderPanel([], [icue]);
      expect(cardOf('iCUE')).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(screen.getByRole('radio', { name: 'conflicts.devices.nexusControls' }));
      expect(screen.getByRole('button', { name: confirmKey })).toBeInTheDocument();
      expect(cardOf('iCUE')).toHaveAttribute('aria-pressed', 'false');
      await press(confirmKey);
      expect(cardOf('iCUE')).toHaveAttribute('aria-pressed', 'true');

      await press('conflicts.outcome.terminateOne');
      expect(screen.queryByRole('button', { name: confirmKey })).not.toBeInTheDocument();
      expect(mockKill).toHaveBeenCalledWith('icue');
    });

    it('a card click does not ask until the primary button', () => {
      renderPanel([], [icue]);
      fireEvent.click(cardOf('iCUE'));

      expect(cardOf('iCUE')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByRole('button', { name: confirmKey })).not.toBeInTheDocument();
    });
  });

  it('terminating a card whose switch is pinned to the app moves the switch to Nexus', () => {
    renderPanel();
    fireEvent.click(screen.getAllByRole('radio', { name: 'conflicts.devices.appControls:Stream Deck' })[0]);
    expect(cardOf('Stream Deck')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(cardOf('Stream Deck'));

    expect(cardOf('Stream Deck')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('radio', { name: 'conflicts.devices.nexusControls' })[0]).toHaveAttribute('aria-checked', 'true');
  });
});

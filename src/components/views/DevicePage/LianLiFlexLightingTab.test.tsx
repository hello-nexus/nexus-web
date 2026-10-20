import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessLightingTab } from './LianLiWirelessLightingTab';
import { mergeLeaderMac } from './lianliChainUtils';
import type {
  LianLiChainLightingApi,
  LianLiFlexZone,
  LianLiWirelessChainLighting,
  LianLiWirelessLighting,
} from '../../../api/lianli-wireless';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const modes = [
  { key: 'rainbow', hasSpeed: true, hasDirection: true, colorsMin: 0, colorsMax: 0, mergeable: true },
  { key: 'static', hasSpeed: false, hasDirection: false, colorsMin: 1, colorsMax: 1 },
  { key: 'meteor', hasSpeed: true, hasDirection: true, colorsMin: 1, colorsMax: 4, defaultColors: ['#aa0000', '#00aa00', '#0000aa', '#aaaa00'] },
];

const zone = (id: LianLiFlexZone['id'], extra: Partial<LianLiFlexZone> = {}): LianLiFlexZone => ({
  id, ledCount: 13, mode: 'rainbow', speed: 3, direction: 0, brightness: 4, colors: [], ...extra,
});

const tlUnit: LianLiWirelessChainLighting = {
  mac: 'AA11', kind: 'fans', devType: 0, model: '', fanType: 51, fanCount: 1, lanes: 0, ledsPerLane: 0,
  modes, supportsPerLane: false, mode: 'rainbow', speed: 3, direction: 0, brightness: 4, colors: [], laneSettings: [],
  supportsZones: true, zones: [zone('up'), zone('down')], upDownSwap: false, sortIndex: 0,
};

const slInfUnit: LianLiWirelessChainLighting = {
  ...tlUnit, mac: 'BB22', fanType: 43, upDownSwap: null, sortIndex: 0,
  zones: [zone('center'), zone('inner'), zone('outer')],
};

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockReset = vi.fn();
const api: LianLiChainLightingApi = {
  get: (...a) => mockGet(...a),
  set: (...a) => mockSet(...a),
  reset: (...a) => mockReset(...a),
};

async function renderTab(chains: LianLiWirelessChainLighting[], withApi: LianLiChainLightingApi = api) {
  const data: LianLiWirelessLighting = { laneModes: [], chains };
  mockGet.mockResolvedValue(data);
  await act(async () => {
    render(<LianLiWirelessLightingTab api={withApi} />);
  });
}

/** Renders against a service that applies each accepted patch and names the merge leader, as the real one does. */
async function renderServed(chains: LianLiWirelessChainLighting[], extra: Parameters<typeof render>[1] = undefined) {
  let store = chains;
  mockGet.mockImplementation(() => Promise.resolve({ laneModes: [], chains: store, mergeLeaderMac: mergeLeaderMac(store) ?? '' }));
  mockSet.mockImplementation((mac: string, patch: Partial<LianLiWirelessChainLighting>) => {
    store = store.map(c => (c.mac === mac ? { ...c, ...patch } : c));
    return Promise.resolve(true);
  });
  await act(async () => {
    render(<LianLiWirelessLightingTab api={api} />, extra);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue(true);
  mockReset.mockResolvedValue(true);
});

describe('LianLiWirelessLightingTab with the wired LCD Flex api', () => {
  it('offers Per zone as a mode and shows no zone sections while one effect plays', async () => {
    await renderTab([tlUnit]);
    fireEvent.click(screen.getByLabelText('devices.lianli.lightingMode'));
    const options = (await screen.findAllByRole('option')).map(o => o.textContent);
    // Per zone leads, set apart from the effects by a rule that is not an option.
    expect(options).toEqual(['devices.lianli-flex.modePerZone', 'devices.lianliEffect.rainbow', 'devices.lianliEffect.static', 'devices.lianliEffect.meteor']);
    expect(screen.queryByText('devices.lianli-flex.zoneUp')).not.toBeInTheDocument();
  });

  it('picking Per zone saves the mode', async () => {
    await renderTab([tlUnit]);
    fireEvent.click(screen.getByLabelText('devices.lianli.lightingMode'));
    fireEvent.click(await screen.findByRole('option', { name: 'devices.lianli-flex.modePerZone' }));
    expect(mockSet).toHaveBeenCalledWith('AA11', { mode: 'perZone', effectMode: undefined });
  });

  it('TL Per zone lists Up and Down, each with its own effect, and saves one zone at a time', async () => {
    await renderTab([{ ...tlUnit, mode: 'perZone' }]);
    expect(screen.getByText('devices.lianli-flex.zoneUp')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-flex.zoneDown')).toBeInTheDocument();
    // The chain's own Mode, then Up's, then Down's.
    fireEvent.click(screen.getAllByLabelText('devices.lianli.lightingMode')[1]);
    fireEvent.click(await screen.findByRole('option', { name: 'devices.lianliEffect.static' }));
    expect(mockSet).toHaveBeenCalledWith('AA11', { zones: [{ id: 'up', mode: 'static' }], effectMode: undefined });
  });

  it('SL-INF Per zone lists Blades, Inner and Outer', async () => {
    await renderTab([{ ...slInfUnit, mode: 'perZone' }]);
    for (const z of ['Center', 'Inner', 'Outer']) {
      expect(screen.getByText(`devices.lianli-flex.zone${z}`)).toBeInTheDocument();
    }
    expect(screen.queryByText(/zoneUp/)).not.toBeInTheDocument();
  });

  it('shows the up and down swap on a TL unit only and saves it', async () => {
    await renderTab([tlUnit, slInfUnit]);
    const swaps = screen.getAllByRole('switch', { name: 'devices.lianli-flex.upDownSwap' });
    expect(swaps).toHaveLength(1);
    fireEvent.click(swaps[0]);
    expect(mockSet).toHaveBeenCalledWith('AA11', { upDownSwap: true, effectMode: undefined });
  });

  it('offers Merge for a mergeable effect with the two-fan wording', async () => {
    await renderTab([tlUnit]);
    expect(screen.getByText('devices.lianli-flex.mergeHint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-wireless.merge' }));
    expect(mockSet).toHaveBeenCalledWith('AA11', { merge: true, effectMode: undefined });
  });

  it('resets a unit only after confirming, then reloads it', async () => {
    await renderTab([tlUnit]);
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.resetLightingButton' }));
    expect(mockReset).not.toHaveBeenCalled();
    expect(await screen.findByText('devices.lianli-flex.resetConfirmTitle')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.resetLighting' }));
    });
    expect(mockReset).toHaveBeenCalledWith('AA11');
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('cancelling the reset sends nothing', async () => {
    await renderTab([tlUnit]);
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.resetLightingButton' }));
    expect(await screen.findByText('devices.lianli-flex.resetConfirmTitle')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('lists the units in light sequence order and moves one along it', async () => {
    await renderServed([{ ...tlUnit, sortIndex: 1 }, { ...slInfUnit, sortIndex: 0 }]);
    const titles = screen.getAllByText(/devices.lianli-wireless.fanType/).map(e => e.textContent);
    expect(titles).toEqual(['devices.lianli-wireless.fanTypeSlInfFlex', 'devices.lianli-wireless.fanTypeTlFlex']);
    const first = screen.getByText('devices.lianli-wireless.fanTypeSlInfFlex').closest('section')!;
    expect(within(first).getByRole('button', { name: 'devices.lianli-wireless.orderMoveLeft' })).toBeDisabled();
    await act(async () => {
      fireEvent.click(within(first).getByRole('button', { name: 'devices.lianli-wireless.orderMoveRight' }));
    });
    expect(mockSet).toHaveBeenCalledWith('BB22', { sortIndex: 1, effectMode: undefined });
    expect(mockSet).toHaveBeenCalledWith('AA11', { sortIndex: 0, effectMode: undefined });
    const after = screen.getAllByText(/devices.lianli-wireless.fanType/).map(e => e.textContent);
    expect(after).toEqual(['devices.lianli-wireless.fanTypeTlFlex', 'devices.lianli-wireless.fanTypeSlInfFlex']);
  });

  it('shows no order controls for a single unit', async () => {
    await renderTab([tlUnit]);
    expect(screen.queryByText('devices.lianli-flex.lightSequence')).not.toBeInTheDocument();
  });

  it('keeps the wireless tab free of the wired controls', async () => {
    const wirelessChain: LianLiWirelessChainLighting = {
      ...tlUnit, supportsZones: undefined, zones: undefined, upDownSwap: undefined, sortIndex: undefined,
    };
    await renderTab([wirelessChain, { ...wirelessChain, mac: 'CC33' }], { get: api.get, set: api.set });
    expect(screen.queryByText('devices.lianli-flex.resetLighting')).not.toBeInTheDocument();
    expect(screen.queryByText('devices.lianli-flex.lightSequence')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'devices.lianli-flex.upDownSwap' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText('devices.lianli.lightingMode')[0]);
    expect((await screen.findAllByRole('option')).map(o => o.textContent)).not.toContain('devices.lianli-flex.modePerZone');
  });

  it('seeds the pickers from the effect default colors and saves only as many colors as the effect uses', async () => {
    await renderTab([{ ...tlUnit, mode: 'meteor' }]);
    const inputs = screen.getAllByLabelText('common.hexColor') as HTMLInputElement[];
    expect(inputs.map(i => i.value.toLowerCase())).toEqual(['#aa0000', '#00aa00', '#0000aa', '#aaaa00']);
    fireEvent.change(inputs[1], { target: { value: '#123456' } });
    const sent = mockSet.mock.calls[mockSet.mock.calls.length - 1][1];
    expect(sent.colors).toEqual(['#aa0000', '#123456', '#0000aa', '#aaaa00']);
    expect(sent.colors.length).toBeLessThanOrEqual(4);
  });

  it('saves at most four colors from a zone too', async () => {
    const zones = [zone('up', { mode: 'meteor', colors: ['#111111', '#222222', '#333333', '#444444'] }), zone('down')];
    await renderTab([{ ...tlUnit, mode: 'perZone', zones }]);
    fireEvent.change(screen.getAllByLabelText('common.hexColor')[3], { target: { value: '#abcdef' } });
    const sent = mockSet.mock.calls[mockSet.mock.calls.length - 1][1];
    expect(sent.zones[0].colors).toEqual(['#111111', '#222222', '#333333', '#abcdef']);
  });

  it('locks the look of a merged unit that is not the leader and says whom it follows', async () => {
    const a = { ...tlUnit, mac: 'AA11', sortIndex: 0, merge: true };
    const b = { ...slInfUnit, mac: 'BB22', sortIndex: 1, merge: true };
    await renderTab([a, b]);
    const follower = screen.getByText('devices.lianli-wireless.fanTypeSlInfFlex').closest('section')!;
    expect(within(follower).getByText('devices.lianli-flex.followsLeader:{"leader":"devices.lianli-wireless.fanTypeTlFlex"}')).toBeInTheDocument();
    expect(within(follower).getByLabelText('devices.lianli.lightingMode')).toBeDisabled();
    expect(within(follower).getByRole('slider', { name: 'devices.lianli.lightingBrightnessAria' })).toBeDisabled();
    expect(within(follower).getByRole('switch', { name: 'devices.lianli-wireless.merge' })).not.toBeDisabled();
    expect(within(follower).getByRole('button', { name: 'devices.lianli-wireless.orderMoveLeft' })).not.toBeDisabled();
    const leader = screen.getByText('devices.lianli-wireless.fanTypeTlFlex').closest('section')!;
    expect(within(leader).queryByText(/followsLeader/)).not.toBeInTheDocument();
    expect(within(leader).getByLabelText('devices.lianli.lightingMode')).not.toBeDisabled();
  });

  it('the leader is the first unit with merge on, not the first unit', async () => {
    const a = { ...tlUnit, mac: 'AA11', sortIndex: 0, merge: false };
    const b = { ...slInfUnit, mac: 'BB22', sortIndex: 1, merge: true };
    await renderTab([a, b]);
    expect(screen.queryByText(/followsLeader/)).not.toBeInTheDocument();
  });

  it('shows an error when the reset is refused or rejected', async () => {
    mockReset.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('offline'));
    await renderTab([tlUnit]);
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.resetLightingButton' }));
      await act(async () => {
        fireEvent.click(await screen.findByRole('button', { name: 'devices.lianli-flex.resetLighting' }));
      });
      expect(screen.getByRole('alert')).toHaveTextContent('devices.lianli-flex.resetFailed');
    }
  });

  it('renders the header above the units', async () => {
    mockGet.mockResolvedValue({ laneModes: [], chains: [tlUnit, slInfUnit] });
    await act(async () => { render(<LianLiWirelessLightingTab api={api} header={() => <p>group-header</p>} />); });
    expect(screen.getByText('group-header')).toBeInTheDocument();
  });

  it('puts each zone directly under the Mode, before the swap, order, reset and apply rows', async () => {
    await renderTab([{ ...tlUnit, mode: 'perZone' }]);
    const order = [
      screen.getAllByLabelText('devices.lianli.lightingMode')[0],
      screen.getByText('devices.lianli-flex.zoneUp'),
      screen.getByText('devices.lianli-flex.zoneDown'),
      screen.getByText('devices.lianli-flex.upDownSwap'),
      screen.getByText('devices.lianli-flex.resetLighting'),
    ];
    order.slice(1).forEach((el, i) => {
      expect(order[i].compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(document.querySelectorAll('section')).toHaveLength(1);
  });

  it('keeps the leader Merge row visible and disabled with a reason when its mode cannot merge', async () => {
    await renderTab([{ ...tlUnit, mode: 'perZone', merge: true }]);
    const merge = screen.getByRole('switch', { name: 'devices.lianli-wireless.merge' });
    expect(merge).toBeDisabled();
    expect(screen.getByText('devices.lianli-flex.mergeNeedsEffect')).toBeInTheDocument();
  });

  it('never says Follows when no unit leads', async () => {
    const a = { ...tlUnit, mode: 'perZone', sortIndex: 0, merge: true };
    const b = { ...slInfUnit, sortIndex: 1, merge: true };
    await renderTab([a, b]);
    // b is the first unit that can merge, so it leads and a (per zone) is not a follower.
    expect(screen.queryByText(/followsLeader/)).not.toBeInTheDocument();
    document.body.innerHTML = '';
    await renderTab([{ ...tlUnit, merge: false }, { ...slInfUnit, merge: false }]);
    expect(screen.queryByText(/followsLeader/)).not.toBeInTheDocument();
  });

  it('takes the leader from the service when it names one', async () => {
    const a = { ...tlUnit, sortIndex: 0, merge: true };
    const b = { ...slInfUnit, sortIndex: 1, merge: true };
    mockGet.mockResolvedValue({ laneModes: [], chains: [a, b], mergeLeaderMac: 'BB22' });
    await act(async () => { render(<LianLiWirelessLightingTab api={api} />); });
    const aSection = screen.getByText('devices.lianli-wireless.fanTypeTlFlex').closest('section')!;
    expect(within(aSection).getByText(/followsLeader/)).toBeInTheDocument();
    mockGet.mockResolvedValue({ laneModes: [], chains: [a, b], mergeLeaderMac: null });
    document.body.innerHTML = '';
    await act(async () => { render(<LianLiWirelessLightingTab api={api} />); });
    expect(screen.queryByText(/followsLeader/)).not.toBeInTheDocument();
  });

  it('with sync on, every fan follows it: look locked, merge locked, swap and order still usable', async () => {
    mockGet.mockResolvedValue({ laneModes: [], chains: [tlUnit, slInfUnit] });
    await act(async () => { render(<LianLiWirelessLightingTab api={api} syncOn />); });
    expect(screen.getAllByText('devices.lianli-flex.followsSync')).toHaveLength(2);
    for (const select of screen.getAllByLabelText('devices.lianli.lightingMode')) expect(select).toBeDisabled();
    for (const merge of screen.getAllByRole('switch', { name: 'devices.lianli-wireless.merge' })) expect(merge).toBeDisabled();
    for (const sw of screen.getAllByRole('switch', { name: 'devices.lightingPage.use' })) expect(sw).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'devices.lianli-flex.upDownSwap' })).not.toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'devices.lianli-wireless.orderMoveRight' })[0]).not.toBeDisabled();
  });

  it('the reset confirm says it ends Lighting page control when the fan is under it', async () => {
    await renderTab([{ ...tlUnit, mode: 'custom', effectMode: 'rainbow' }]);
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.resetLightingButton' }));
    expect(await screen.findByText('devices.lianli-flex.resetConfirmMessageLightingPage')).toBeInTheDocument();
  });

  it('keeps swap enabled while the Lighting page controls the fan', async () => {
    await renderTab([{ ...tlUnit, mode: 'custom', effectMode: 'rainbow' }]);
    expect(screen.getByRole('switch', { name: 'devices.lianli-flex.upDownSwap' })).not.toBeDisabled();
  });

  it('says no unit leads for an empty mergeLeaderMac, with no Follows row', async () => {
    const a = { ...tlUnit, sortIndex: 0, merge: true };
    const b = { ...slInfUnit, sortIndex: 1, merge: true };
    mockGet.mockResolvedValue({ laneModes: [], chains: [a, b], mergeLeaderMac: '' });
    await act(async () => { render(<LianLiWirelessLightingTab api={api} />); });
    expect(screen.queryByText(/followsLeader/)).not.toBeInTheDocument();
  });

  it('names two units of one model apart, and says which one it follows', async () => {
    const a = { ...tlUnit, mac: 'AA11', sortIndex: 0, merge: true };
    const b = { ...tlUnit, mac: 'CC33', sortIndex: 1, merge: true };
    await renderTab([a, b]);
    const second = screen.getByText('devices.lianli-wireless.fanTypeTlFlex 2').closest('section')!;
    expect(within(second).getByText('devices.lianli-flex.followsLeader:{"leader":"devices.lianli-wireless.fanTypeTlFlex"}')).toBeInTheDocument();
  });

  it('reads the units back after every write, accepted or not, and tells the caller', async () => {
    const written = vi.fn();
    mockGet.mockResolvedValue({ laneModes: [], chains: [tlUnit] });
    await act(async () => { render(<LianLiWirelessLightingTab api={api} onSettled={written} />); });
    expect(mockGet).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.upDownSwap' })); });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(written).toHaveBeenCalledTimes(1);
    mockSet.mockResolvedValue(false);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.upDownSwap' })); });
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(written).toHaveBeenCalledTimes(2);
  });

  it('reads once, after both writes of a move settle', async () => {
    const settled = vi.fn();
    const releases: Array<() => void> = [];
    let store = [{ ...tlUnit, mac: 'AA11', sortIndex: 0 }, { ...tlUnit, mac: 'CC33', sortIndex: 1 }];
    mockGet.mockImplementation(() => Promise.resolve({ laneModes: [], chains: store }));
    mockSet.mockImplementation((mac: string, patch: Partial<LianLiWirelessChainLighting>) => new Promise(resolve => {
      releases.push(() => { store = store.map(c => (c.mac === mac ? { ...c, ...patch } : c)); resolve(true); });
    }));
    await act(async () => { render(<LianLiWirelessLightingTab api={api} onSettled={settled} />); });
    const reads = mockGet.mock.calls.length;
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'devices.lianli-wireless.orderMoveRight' })[0]); });
    expect(releases).toHaveLength(2);
    await act(async () => { releases[0](); });
    expect(mockGet).toHaveBeenCalledTimes(reads);
    expect(settled).not.toHaveBeenCalled();
    await act(async () => { releases[1](); });
    expect(mockGet).toHaveBeenCalledTimes(reads + 1);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  describe('reads that race a write', () => {
    const tl = { ...tlUnit, mac: 'AA11', sortIndex: 0 };
    const sl = { ...slInfUnit, mac: 'BB22', sortIndex: 1 };
    const orderedTitles = () => screen.getAllByText(/devices.lianli-wireless.fanType(TlFlex|SlInfFlex)$/).map(e => e.textContent);

    async function startMove() {
      const reads: Array<(v: unknown) => void> = [];
      const sets: Array<() => void> = [];
      mockGet.mockImplementationOnce(() => Promise.resolve({ laneModes: [], chains: [tl, sl] }));
      mockSet.mockImplementation(() => new Promise(resolve => { sets.push(() => resolve(true)); }));
      await act(async () => { render(<LianLiWirelessLightingTab api={api} />); });
      expect(orderedTitles()).toEqual(['devices.lianli-wireless.fanTypeTlFlex', 'devices.lianli-wireless.fanTypeSlInfFlex']);
      mockGet.mockImplementation(() => new Promise(resolve => { reads.push(resolve); }));
      return { reads, sets };
    }

    it('keeps a move preview when a read sent before the write lands after it', async () => {
      const { reads, sets } = await startMove();
      await act(async () => { window.dispatchEvent(new Event('focus')); });
      expect(reads).toHaveLength(1);
      await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'devices.lianli-wireless.orderMoveRight' })[0]); });
      expect(orderedTitles()).toEqual(['devices.lianli-wireless.fanTypeSlInfFlex', 'devices.lianli-wireless.fanTypeTlFlex']);
      await act(async () => { reads[0]({ laneModes: [], chains: [tl, sl] }); });
      expect(orderedTitles()).toEqual(['devices.lianli-wireless.fanTypeSlInfFlex', 'devices.lianli-wireless.fanTypeTlFlex']);
      expect(sets).toHaveLength(2);
    });

    it('drops a read answered while a write is still in flight, even one sent after it', async () => {
      const { reads, sets } = await startMove();
      await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'devices.lianli-wireless.orderMoveRight' })[0]); });
      await act(async () => { window.dispatchEvent(new Event('focus')); });
      expect(reads).toHaveLength(1);
      await act(async () => { reads[0]({ laneModes: [], chains: [tl, sl] }); });
      expect(orderedTitles()).toEqual(['devices.lianli-wireless.fanTypeSlInfFlex', 'devices.lianli-wireless.fanTypeTlFlex']);
      expect(sets).toHaveLength(2);
    });

    it('counts a reset as a write: no read until the move settles', async () => {
      const { reads, sets } = await startMove();
      await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'devices.lianli-wireless.orderMoveRight' })[0]); });
      mockReset.mockResolvedValue(true);
      fireEvent.click(screen.getAllByRole('button', { name: 'devices.lianli-flex.resetLightingButton' })[0]);
      await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'devices.lianli-flex.resetLighting' })); });
      expect(reads).toHaveLength(0);
      await act(async () => { sets.forEach(s => s()); });
      expect(reads).toHaveLength(1);
    });

    describe('a write the service never answers', () => {
      const HOLD = 10001;
      const swapSwitch = () => screen.getByRole('switch', { name: 'devices.lianli-flex.upDownSwap' });

      async function setup() {
        vi.useFakeTimers();
        const settled = vi.fn();
        const writes: Array<() => void> = [];
        mockGet.mockResolvedValue({ laneModes: [], chains: [tl] });
        mockSet.mockImplementation(() => new Promise(resolve => { writes.push(() => resolve(true)); }));
        await act(async () => { render(<LianLiWirelessLightingTab api={api} onSettled={settled} />); });
        return { settled, writes };
      }

      it('stops holding reads back after the cap, and reads and reports settled then', async () => {
        const { settled } = await setup();
        try {
          await act(async () => { fireEvent.click(swapSwitch()); });
          mockGet.mockResolvedValue({ laneModes: [], chains: [{ ...tl, mode: 'perZone' }] });
          await act(async () => { window.dispatchEvent(new Event('focus')); });
          expect(screen.queryByText('devices.lianli-flex.zoneUp')).not.toBeInTheDocument();
          expect(settled).not.toHaveBeenCalled();
          await act(async () => { await vi.advanceTimersByTimeAsync(HOLD); });
          expect(settled).toHaveBeenCalledTimes(1);
          expect(screen.getByText('devices.lianli-flex.zoneUp')).toBeInTheDocument();
        } finally {
          vi.useRealTimers();
        }
      });

      it('holds and settles a later write on its own, however long the first one hangs', async () => {
        const { settled, writes } = await setup();
        try {
          await act(async () => { fireEvent.click(swapSwitch()); });
          await act(async () => { await vi.advanceTimersByTimeAsync(HOLD); });
          expect(settled).toHaveBeenCalledTimes(1);
          const reads = mockGet.mock.calls.length;
          await act(async () => { fireEvent.click(swapSwitch()); });
          // The second write is held: a read answered meanwhile is dropped.
          mockGet.mockResolvedValue({ laneModes: [], chains: [{ ...tl, mode: 'perZone' }] });
          await act(async () => { window.dispatchEvent(new Event('focus')); });
          expect(screen.queryByText('devices.lianli-flex.zoneUp')).not.toBeInTheDocument();
          await act(async () => { writes[1](); });
          expect(mockGet.mock.calls.length).toBe(reads + 2);
          expect(settled).toHaveBeenCalledTimes(2);
          expect(screen.getByText('devices.lianli-flex.zoneUp')).toBeInTheDocument();
        } finally {
          vi.useRealTimers();
        }
      });

      it('clears the pending expiry timer when the tab unmounts', async () => {
        const { settled } = await setup();
        try {
          await act(async () => { fireEvent.click(swapSwitch()); });
          const reads = mockGet.mock.calls.length;
          cleanup();
          await act(async () => { await vi.advanceTimersByTimeAsync(HOLD); });
          expect(mockGet.mock.calls.length).toBe(reads);
          expect(settled).not.toHaveBeenCalled();
        } finally {
          vi.useRealTimers();
        }
      });

      it('does not report settled when an expired write resolves while a later write is still in flight', async () => {
        const { settled, writes } = await setup();
        try {
          await act(async () => { fireEvent.click(swapSwitch()); });
          await act(async () => { await vi.advanceTimersByTimeAsync(HOLD); });
          expect(settled).toHaveBeenCalledTimes(1);
          await act(async () => { fireEvent.click(swapSwitch()); });
          const reads = mockGet.mock.calls.length;
          await act(async () => { writes[0](); });
          expect(settled).toHaveBeenCalledTimes(1);
          expect(mockGet.mock.calls.length).toBe(reads);
          await act(async () => { writes[1](); });
          expect(settled).toHaveBeenCalledTimes(2);
          expect(mockGet.mock.calls.length).toBe(reads + 1);
        } finally {
          vi.useRealTimers();
        }
      });

      it('asks for exactly one more read when the expired write finally resolves, and does not count it twice', async () => {
        const { settled, writes } = await setup();
        try {
          await act(async () => { fireEvent.click(swapSwitch()); });
          await act(async () => { await vi.advanceTimersByTimeAsync(HOLD); });
          const reads = mockGet.mock.calls.length;
          await act(async () => { writes[0](); });
          expect(mockGet.mock.calls.length).toBe(reads + 1);
          expect(settled).toHaveBeenCalledTimes(2);
          // The count is back to zero, not negative: the next write is held and settled normally.
          await act(async () => { fireEvent.click(swapSwitch()); });
          mockGet.mockResolvedValue({ laneModes: [], chains: [{ ...tl, mode: 'perZone' }] });
          await act(async () => { window.dispatchEvent(new Event('focus')); });
          expect(screen.queryByText('devices.lianli-flex.zoneUp')).not.toBeInTheDocument();
          await act(async () => { writes[1](); });
          expect(screen.getByText('devices.lianli-flex.zoneUp')).toBeInTheDocument();
        } finally {
          vi.useRealTimers();
        }
      });
    });

    describe('a failure', () => {
      const unhandled = vi.fn();
      beforeEach(() => { unhandled.mockClear(); process.on('unhandledRejection', unhandled); });
      afterEach(() => { process.off('unhandledRejection', unhandled); });
      const swap = async (settled: () => void) => {
        await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.upDownSwap' })); });
        await waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
      };

      it('in the read after a write still reports settled, with nothing unhandled', async () => {
        const settled = vi.fn();
        mockGet.mockResolvedValueOnce({ laneModes: [], chains: [tl] });
        mockSet.mockResolvedValue(true);
        await act(async () => { render(<LianLiWirelessLightingTab api={api} onSettled={settled} />); });
        mockGet.mockRejectedValue(new Error('bad json'));
        await swap(settled);
        expect(settled).toHaveBeenCalledTimes(1);
        expect(unhandled).not.toHaveBeenCalled();
      });

      it('in the write itself still reads back and reports settled, with nothing unhandled', async () => {
        const settled = vi.fn();
        mockGet.mockResolvedValue({ laneModes: [], chains: [tl] });
        mockSet.mockImplementation(() => { throw new Error('offline'); });
        await act(async () => { render(<LianLiWirelessLightingTab api={api} onSettled={settled} />); });
        await swap(settled);
        expect(mockGet).toHaveBeenCalledTimes(2);
        expect(settled).toHaveBeenCalledTimes(1);
        expect(unhandled).not.toHaveBeenCalled();
      });
    });
  });

  it('re-reads the units when a write made outside the tab, such as the sync header, signals it', async () => {
    mockGet.mockResolvedValue({ laneModes: [], chains: [{ ...tlUnit, mode: 'perZone' }] });
    const view = render(<LianLiWirelessLightingTab api={api} reloadSignal={0} />);
    await act(async () => {});
    expect(screen.getByText('devices.lianli-flex.zoneUp')).toBeInTheDocument();
    mockGet.mockResolvedValue({ laneModes: [], chains: [{ ...tlUnit, mode: 'rainbow' }] });
    await act(async () => { view.rerender(<LianLiWirelessLightingTab api={api} reloadSignal={1} />); });
    expect(screen.queryByText('devices.lianli-flex.zoneUp')).not.toBeInTheDocument();
    expect(screen.getByLabelText('devices.lianli.lightingMode')).toHaveTextContent('devices.lianliEffect.rainbow');
  });

  it('shows Follows right after Merge is turned on for both units, then follows the leader as it changes', async () => {
    const a = { ...tlUnit, mac: 'AA11', sortIndex: 0, merge: false };
    const b = { ...tlUnit, mac: 'CC33', sortIndex: 1, merge: false };
    await renderServed([a, b]);
    const merges = () => screen.getAllByRole('switch', { name: 'devices.lianli-wireless.merge' });
    const sectionOf = (title: string) => screen.getByText(title).closest('section')!;
    await act(async () => { fireEvent.click(merges()[0]); });
    await act(async () => { fireEvent.click(merges()[1]); });
    expect(within(sectionOf('devices.lianli-wireless.fanTypeTlFlex 2')).getByText(/followsLeader/)).toBeInTheDocument();
    expect(within(sectionOf('devices.lianli-wireless.fanTypeTlFlex 2')).getByLabelText('devices.lianli.lightingMode')).toBeDisabled();
    // The first unit stops merging, so the second now leads and nothing follows.
    await act(async () => { fireEvent.click(merges()[0]); });
    expect(screen.queryByText(/followsLeader/)).not.toBeInTheDocument();
    expect(within(sectionOf('devices.lianli-wireless.fanTypeTlFlex 2')).getByLabelText('devices.lianli.lightingMode')).not.toBeDisabled();
  });

  it('does not let a leader named before a merge toggle hide the follower while the write is in flight', async () => {
    const a = { ...tlUnit, mac: 'AA11', sortIndex: 0, merge: true };
    const b = { ...tlUnit, mac: 'CC33', sortIndex: 1, merge: false };
    mockGet.mockResolvedValue({ laneModes: [], chains: [a, b], mergeLeaderMac: '' });
    mockSet.mockReturnValue(new Promise(() => {}));
    await act(async () => { render(<LianLiWirelessLightingTab api={api} />); });
    const second = screen.getByText('devices.lianli-wireless.fanTypeTlFlex 2').closest('section')!;
    await act(async () => { fireEvent.click(within(second).getByRole('switch', { name: 'devices.lianli-wireless.merge' })); });
    expect(within(second).getByText(/followsLeader/)).toBeInTheDocument();
  });

  describe('follow the motherboard ARGB', () => {
    const argbSwitch = () => screen.queryByRole('switch', { name: 'devices.motherboardArgb.label' });

    it('is offered only while the cable is connected or the toggle is on', async () => {
      await renderTab([tlUnit]);
      expect(argbSwitch()).not.toBeInTheDocument();
      document.body.innerHTML = '';
      await renderTab([{ ...tlUnit, argbCableConnected: true }]);
      expect(argbSwitch()).toHaveAttribute('aria-checked', 'false');
      document.body.innerHTML = '';
      await renderTab([{ ...tlUnit, motherboardArgb: true }]);
      expect(argbSwitch()).toHaveAttribute('aria-checked', 'true');
    });

    it('with no saved choice shows what the unit reports it is playing', async () => {
      await renderTab([{ ...tlUnit, argbCableConnected: true, motherboardArgb: null, playingMotherboardArgb: true }]);
      expect(argbSwitch()).toHaveAttribute('aria-checked', 'true');
    });

    it('saves the choice through the Flex lighting route', async () => {
      await renderTab([{ ...tlUnit, argbCableConnected: true }]);
      await act(async () => { fireEvent.click(argbSwitch()!); });
      expect(mockSet).toHaveBeenCalledWith('AA11', { motherboardArgb: true, effectMode: undefined });
    });

    it('while on, locks the effect controls, the Lighting page switch and the swap like the wireless tab', async () => {
      await renderTab([{ ...tlUnit, argbCableConnected: true, motherboardArgb: true }]);
      expect(screen.getByLabelText('devices.lianli.lightingMode')).toBeDisabled();
      expect(screen.getByRole('switch', { name: 'devices.lightingPage.use' })).toBeDisabled();
      expect(screen.getByRole('switch', { name: 'devices.lianli-flex.upDownSwap' })).toBeDisabled();
      expect(screen.getByRole('switch', { name: 'devices.lianli-wireless.merge' })).toBeDisabled();
    });
  });
});

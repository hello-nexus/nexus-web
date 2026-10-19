import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessLightingTab } from './LianLiWirelessLightingTab';
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
    expect(options).toEqual(['devices.lianliEffect.rainbow', 'devices.lianliEffect.static', 'devices.lianli-flex.modePerZone']);
    expect(screen.queryByText(/devices.lianli-flex.zoneSection/)).not.toBeInTheDocument();
  });

  it('picking Per zone saves the mode', async () => {
    await renderTab([tlUnit]);
    fireEvent.click(screen.getByLabelText('devices.lianli.lightingMode'));
    fireEvent.click(await screen.findByRole('option', { name: 'devices.lianli-flex.modePerZone' }));
    expect(mockSet).toHaveBeenCalledWith('AA11', { mode: 'perZone', effectMode: undefined });
  });

  it('TL Per zone lists Up and Down, each with its own effect, and saves one zone at a time', async () => {
    await renderTab([{ ...tlUnit, mode: 'perZone' }]);
    const up = screen.getByText(/zoneSection.*devices.lianli-flex.zoneUp/).closest('section')!;
    expect(screen.getByText(/zoneSection.*devices.lianli-flex.zoneDown/)).toBeInTheDocument();
    fireEvent.click(within(up).getByLabelText('devices.lianli.lightingMode'));
    fireEvent.click(await screen.findByRole('option', { name: 'devices.lianliEffect.static' }));
    expect(mockSet).toHaveBeenCalledWith('AA11', { zones: [{ id: 'up', mode: 'static' }], effectMode: undefined });
  });

  it('SL-INF Per zone lists Blades, Inner and Outer', async () => {
    await renderTab([{ ...slInfUnit, mode: 'perZone' }]);
    for (const z of ['Center', 'Inner', 'Outer']) {
      expect(screen.getByText(new RegExp(`zoneSection.*devices.lianli-flex.zone${z}`))).toBeInTheDocument();
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
    await renderTab([{ ...tlUnit, sortIndex: 1 }, { ...slInfUnit, sortIndex: 0 }]);
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
});

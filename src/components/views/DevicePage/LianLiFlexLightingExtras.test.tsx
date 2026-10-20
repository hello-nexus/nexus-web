import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiFlexSyncSection, useLianLiFlexSync } from './LianLiFlexSyncSection';
import type { LianLiFlexSync } from '../../../api/lianli-flex';
import type { LianLiWirelessChainLighting } from '../../../api/lianli-wireless';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockGetSync = vi.fn();
const mockSetSync = vi.fn();

vi.mock('../../../api/lianli-flex', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli-flex')>()),
  getLianLiFlexSync: (...a: any[]) => mockGetSync(...a),
  setLianLiFlexSync: (...a: any[]) => mockSetSync(...a),
}));

const modes = [
  { key: 'rainbow', hasSpeed: true, hasDirection: true, colorsMin: 0, colorsMax: 0, mergeable: true },
  { key: 'meteor', hasSpeed: true, hasDirection: true, colorsMin: 1, colorsMax: 4, mergeable: true },
];

const sync = (extra: Partial<LianLiFlexSync> = {}): LianLiFlexSync => ({
  enabled: true, mode: 'meteor', speed: 3, direction: 0, brightness: 4, colors: ['#111111', '#222222', '#333333', '#444444'], modes,
  members: [
    { mac: 'AA11', family: 'tlFlex', label: 'TL Flex', sortIndex: 0, sliceDirection: 0 },
    { mac: 'BB22', family: 'slInfFlex', label: 'SL-INF Flex', sortIndex: 1, sliceDirection: 1 },
  ],
  ...extra,
});

const unit = (mac: string, mode: string) => ({ mac, mode }) as unknown as LianLiWirelessChainLighting;
let chains: LianLiWirelessChainLighting[] = [];
const written = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSync.mockResolvedValue(sync());
  mockSetSync.mockResolvedValue(true);
  chains = [];
});

describe('LianLiFlexSyncSection', () => {
  function Harness() {
    const sync = useLianLiFlexSync(true, written);
    return (
      <>
        <LianLiFlexSyncSection sync={sync} chains={chains} />
        <button type="button" onClick={() => sync.reorder(['BB22', 'AA11'])}>reorder</button>
      </>
    );
  }
  const renderSync = async () => { await act(async () => { render(<Harness />); }); };

  it('renders nothing for a service without the route or a single fan', async () => {
    mockGetSync.mockResolvedValue(null);
    await renderSync();
    expect(screen.queryByText('devices.lianli-flex.syncSection')).not.toBeInTheDocument();
    document.body.innerHTML = '';
    mockGetSync.mockResolvedValue(sync({ members: sync().members.slice(0, 1) }));
    await renderSync();
    expect(screen.queryByText('devices.lianli-flex.syncSection')).not.toBeInTheDocument();
  });

  it('is an on/off toggle that saves immediately', async () => {
    await renderSync();
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.syncEnable' })); });
    expect(mockSetSync).toHaveBeenCalledWith({ enabled: false });
  });

  it('lists only the merge effects the service offers and saves the mode', async () => {
    await renderSync();
    fireEvent.click(screen.getByLabelText('devices.lianli.lightingMode'));
    expect((await screen.findAllByRole('option')).map(o => o.textContent))
      .toEqual(['devices.lianliEffect.rainbow', 'devices.lianliEffect.meteor']);
    await act(async () => { fireEvent.click(screen.getByRole('option', { name: 'devices.lianliEffect.rainbow' })); });
    expect(mockSetSync).toHaveBeenCalledWith({ mode: 'rainbow' });
  });

  it('saves at most four colors', async () => {
    await renderSync();
    fireEvent.change(screen.getAllByLabelText('common.hexColor')[1], { target: { value: '#abcdef' } });
    const sent = mockSetSync.mock.calls[mockSetSync.mock.calls.length - 1][0];
    expect(sent.colors).toHaveLength(4);
    expect(sent.colors[1]).toBe('#abcdef');
  });

  it('sets the slice direction of one member in list order', async () => {
    await renderSync();
    fireEvent.click(screen.getByLabelText('devices.lianli-flex.syncMemberDirection:{"fan":"devices.lianli-wireless.fanTypeTlFlex"}'));
    await act(async () => { fireEvent.click(await screen.findByRole('option', { name: 'devices.lianli.directionRtl' })); });
    expect(mockSetSync).toHaveBeenCalledWith({
      members: [{ mac: 'AA11', sliceDirection: 1 }, { mac: 'BB22', sliceDirection: 1 }],
    });
  });

  it('sends the order set locally, not the last poll, when a direction changes after a move', async () => {
    await renderSync();
    fireEvent.click(screen.getByText('reorder'));
    fireEvent.click(screen.getByLabelText('devices.lianli-flex.syncMemberDirection:{"fan":"devices.lianli-wireless.fanTypeSlInfFlex"}'));
    await act(async () => { fireEvent.click(await screen.findByRole('option', { name: 'devices.lianli.directionLtr' })); });
    expect(mockSetSync).toHaveBeenCalledWith({
      members: [{ mac: 'BB22', sliceDirection: 0 }, { mac: 'AA11', sliceDirection: 0 }],
    });
  });

  it('tells the caller about an accepted write and reads the group back', async () => {
    await renderSync();
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.syncEnable' })); });
    expect(written).toHaveBeenCalledTimes(1);
    expect(mockGetSync).toHaveBeenCalledTimes(2);
    mockSetSync.mockResolvedValue(false);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.syncEnable' })); });
    expect(written).toHaveBeenCalledTimes(1);
  });

  describe('turning sync on', () => {
    const toggle = () => screen.getByRole('switch', { name: 'devices.lianli-flex.syncEnable' });

    it('asks first when a unit is under Lighting page control or on Per zone, and sends nothing until confirmed', async () => {
      mockGetSync.mockResolvedValue(sync({ enabled: false }));
      chains = [unit('AA11', 'custom'), unit('BB22', 'rainbow')];
      await renderSync();
      await act(async () => { fireEvent.click(toggle()); });
      expect(await screen.findByText('devices.lianli-flex.syncConfirmTitle')).toBeInTheDocument();
      expect(mockSetSync).not.toHaveBeenCalled();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.syncConfirmButton' })); });
      expect(mockSetSync).toHaveBeenCalledWith({ enabled: true });
    });

    it('cancelling the confirm sends nothing', async () => {
      mockGetSync.mockResolvedValue(sync({ enabled: false }));
      chains = [unit('AA11', 'rainbow'), unit('BB22', 'perZone')];
      await renderSync();
      await act(async () => { fireEvent.click(toggle()); });
      fireEvent.click(await screen.findByRole('button', { name: 'confirm.cancel' }));
      expect(mockSetSync).not.toHaveBeenCalled();
    });

    it('does not ask when every unit already plays an effect', async () => {
      mockGetSync.mockResolvedValue(sync({ enabled: false }));
      chains = [unit('AA11', 'rainbow'), unit('BB22', 'meteor')];
      await renderSync();
      await act(async () => { fireEvent.click(toggle()); });
      expect(screen.queryByText('devices.lianli-flex.syncConfirmTitle')).not.toBeInTheDocument();
      expect(mockSetSync).toHaveBeenCalledWith({ enabled: true });
    });
  });

  it('shows the first effect, not a blank, when the stored mode is not a group effect', async () => {
    mockGetSync.mockResolvedValue(sync({ mode: 'perZone' }));
    await renderSync();
    expect(screen.getByLabelText('devices.lianli.lightingMode')).toHaveTextContent('devices.lianliEffect.rainbow');
  });

  it('locks the look while sync is off', async () => {
    mockGetSync.mockResolvedValue(sync({ enabled: false }));
    await renderSync();
    expect(screen.getByLabelText('devices.lianli.lightingMode')).toBeDisabled();
  });

  it('re-reads the group when the service refuses a change', async () => {
    mockSetSync.mockResolvedValue(false);
    await renderSync();
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.syncEnable' })); });
    expect(mockGetSync).toHaveBeenCalledTimes(2);
  });
});

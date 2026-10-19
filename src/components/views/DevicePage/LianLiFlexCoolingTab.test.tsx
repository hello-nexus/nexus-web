import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiWirelessCoolingTab } from './LianLiWirelessCoolingTab';
import type { LianLiFlexFanProfile } from '../../../api/lianli-flex';
import type { LianLiFansState } from '../../../api/lianli-wireless';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

vi.mock('../../../api/cooling', () => ({
  fetchFanChannels: () => Promise.resolve({
    channels: [
      { id: 'lianli-flex:AA11:port0', name: 'A', dutyPercent: 40, rpm: 661, mode: 'Manual' },
      { id: 'lianli-flex:BB22:port0', name: 'B', dutyPercent: 40, rpm: 700, mode: 'Manual' },
    ],
  }),
  fetchCurves: () => Promise.resolve({ globalSpeedModifier: 100, curves: [] }),
}));

const mockGetProfile = vi.fn();
const mockSetProfile = vi.fn();
const mockRestore = vi.fn();
const mockFanSync = vi.fn();
const mockApplyAll = vi.fn();

vi.mock('../../../api/lianli-flex', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli-flex')>()),
  getLianLiFlexFanProfile: (...a: any[]) => mockGetProfile(...a),
  setLianLiFlexFanProfile: (...a: any[]) => mockSetProfile(...a),
  restoreLianLiFlexFanDefault: (...a: any[]) => mockRestore(...a),
  setLianLiFlexFanSync: (...a: any[]) => mockFanSync(...a),
  applyLianLiFlexToAll: (...a: any[]) => mockApplyAll(...a),
}));

const profile = (mac: string, extra: Partial<LianLiFlexFanProfile> = {}): LianLiFlexFanProfile => ({
  mac, profile: 'stdsp', mbSync: false, source: 'cpu', sourceAvailable: { cpu: true, gpu: true, water: false },
  fanSize: 120, startStop: false, fixedPercent: 50, points: [], curveId: `flex-${mac}`, rpm: 661, dutyPercent: 40, ...extra,
});

const unit = (mac: string) => ({
  mac, masterMac: '', boundToUs: true, channel: 0, slot: 254, devType: 0, fanType: 51, fanCount: 1,
  rpm: [661, 0, 0, 0], pwm: [40, 0, 0, 0],
});

const oneUnit: LianLiFansState = { isConnected: true, fans: [unit('AA11')] };
const twoUnits: LianLiFansState = { isConnected: true, fans: [unit('AA11'), unit('BB22')] };

let profiles: Record<string, LianLiFlexFanProfile>;

async function renderTab(state: LianLiFansState = oneUnit, nav = vi.fn()) {
  await act(async () => {
    render(<LianLiWirelessCoolingTab state={state} channelPrefix="lianli-flex:" flex onSectionNavigate={nav} />);
  });
  return nav;
}

beforeEach(() => {
  vi.clearAllMocks();
  profiles = { AA11: profile('AA11'), BB22: profile('BB22') };
  mockGetProfile.mockImplementation((mac: string) => Promise.resolve(profiles[mac] ?? null));
  mockSetProfile.mockResolvedValue(true);
  mockRestore.mockResolvedValue(true);
  mockFanSync.mockResolvedValue(true);
  mockApplyAll.mockResolvedValue({ ok: true, applied: ['BB22'], skipped: [] });
});

describe('Flex Cooling tab fan profile', () => {
  it('shows a profile section for the unit with the profile, source and start/stop', async () => {
    await renderTab();
    expect(screen.getByText(/profileSection.*fanTypeTlFlex/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'devices.lianli-flex.sourceCpu' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'devices.lianli-flex.startStop' })).toBeInTheDocument();
  });

  it('shows no profile section when the service has no profile routes', async () => {
    mockGetProfile.mockResolvedValue(null);
    await renderTab();
    expect(screen.queryByText(/profileSection/)).not.toBeInTheDocument();
  });

  it('picking a profile saves it at once', async () => {
    await renderTab();
    fireEvent.click(screen.getByLabelText('devices.lianli-flex.profileLabel'));
    await act(async () => { fireEvent.click(await screen.findByRole('option', { name: 'devices.lianli-flex.profileQuiet' })); });
    expect(mockSetProfile).toHaveBeenCalledWith('AA11', { profile: 'quiet' });
  });

  it('offers the four custom profiles and Fixed', async () => {
    await renderTab();
    fireEvent.click(screen.getByLabelText('devices.lianli-flex.profileLabel'));
    const options = (await screen.findAllByRole('option')).map(o => o.textContent);
    expect(options).toEqual([
      'devices.lianli-flex.profileQuiet', 'devices.lianli-flex.profileStd', 'devices.lianli-flex.profileHigh',
      'devices.lianli-flex.profileFull',
      'devices.lianli-flex.profileCustomN:{"n":1}', 'devices.lianli-flex.profileCustomN:{"n":2}',
      'devices.lianli-flex.profileCustomN:{"n":3}', 'devices.lianli-flex.profileCustomN:{"n":4}',
      'devices.lianli-flex.profileFixed',
    ]);
  });

  it('disables Water without a liquid cooler and saves the other sources', async () => {
    await renderTab();
    expect(screen.getByRole('radio', { name: 'devices.lianli-flex.sourceWater' })).toBeDisabled();
    expect(screen.getByText('devices.lianli-flex.sourceWaterHint')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'devices.lianli-flex.sourceGpu' })); });
    expect(mockSetProfile).toHaveBeenCalledWith('AA11', { source: 'gpu' });
  });

  it('enables Water when an AIO exists', async () => {
    profiles.AA11 = profile('AA11', { sourceAvailable: { cpu: true, gpu: true, water: true } });
    await renderTab();
    expect(screen.getByRole('radio', { name: 'devices.lianli-flex.sourceWater' })).not.toBeDisabled();
    expect(screen.queryByText('devices.lianli-flex.sourceWaterHint')).not.toBeInTheDocument();
  });

  it('start/stop is a toggle that saves immediately', async () => {
    await renderTab();
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.startStop' })); });
    expect(mockSetProfile).toHaveBeenCalledWith('AA11', { startStop: true });
  });

  it('Fixed shows a stacked editable speed slider instead of the source', async () => {
    profiles.AA11 = profile('AA11', { profile: 'fixed', fixedPercent: 35 });
    await renderTab();
    expect(screen.getByRole('slider', { name: 'devices.lianli-flex.fixedSpeed' })).toHaveValue('35');
    expect(screen.queryByText('devices.lianli-flex.sourceLabel')).not.toBeInTheDocument();
  });

  it('following the motherboard locks the profile controls but not the toggle', async () => {
    profiles.AA11 = profile('AA11', { mbSync: true });
    await renderTab();
    expect(screen.getByLabelText('devices.lianli-flex.profileLabel')).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'devices.lianli-flex.mbSync' })).not.toBeDisabled();
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.mbSync' })); });
    expect(mockSetProfile).toHaveBeenCalledWith('AA11', { mbSync: false });
  });

  it('restores the default profile only after confirming', async () => {
    await renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.restoreProfileButton' }));
    expect(mockRestore).not.toHaveBeenCalled();
    expect(await screen.findByText('devices.lianli-flex.restoreProfileTitle')).toBeInTheDocument();
    const confirm = screen.getAllByRole('button', { name: 'devices.lianli-flex.restoreProfileButton' }).pop()!;
    await act(async () => { fireEvent.click(confirm); });
    expect(mockRestore).toHaveBeenCalledWith('AA11');
  });

  it('opens the curve editor on the Cooling page at the unit group', async () => {
    const nav = await renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'devices.coolingPage.go' }));
    expect(nav).toHaveBeenCalledWith('cooling', { scrollAnchors: ['cooling-group:lianli-flex:AA11'] });
  });

  it('applies the fan profile to the other fans in the chosen scope after confirming', async () => {
    await renderTab(twoUnits);
    const section = screen.getAllByText(/profileSection/)[0].closest('section')!;
    await act(async () => { fireEvent.click(within(section).getByRole('radio', { name: 'devices.lianli-flex.scopeAll' })); });
    fireEvent.click(within(section).getByRole('button', { name: 'devices.lianli-flex.applyAllButton' }));
    expect(mockApplyAll).not.toHaveBeenCalled();
    expect(await screen.findByText('devices.lianli-flex.applyAllConfirmTitle')).toBeInTheDocument();
    expect(screen.getByText('devices.lianli-flex.applyAllConfirmFan')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'devices.lianli-flex.applyAllButton' }).pop()!);
    });
    expect(mockApplyAll).toHaveBeenCalledWith('AA11', ['fan'], 'all');
  });

  it('shows an error when apply to all fails and a note for skipped fans', async () => {
    mockApplyAll.mockResolvedValueOnce({ ok: false, applied: [], skipped: [] });
    await renderTab(twoUnits);
    const section = screen.getAllByText(/profileSection/)[0].closest('section')!;
    fireEvent.click(within(section).getByRole('button', { name: 'devices.lianli-flex.applyAllButton' }));
    await act(async () => {
      fireEvent.click((await screen.findAllByRole('button', { name: 'devices.lianli-flex.applyAllButton' })).pop()!);
    });
    expect(screen.getByRole('status')).toHaveTextContent('devices.lianli-flex.applyAllFailed');
  });

  it('offers follow the motherboard for all fans only with several units and sends it once', async () => {
    await renderTab(oneUnit);
    expect(screen.queryByRole('switch', { name: 'devices.lianli-flex.mbSyncAll' })).not.toBeInTheDocument();
    document.body.innerHTML = '';
    await renderTab(twoUnits);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.mbSyncAll' })); });
    expect(mockFanSync).toHaveBeenCalledWith(true);
  });
});

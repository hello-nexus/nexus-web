import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LianLiFlexSyncSection, useLianLiFlexSync } from './LianLiFlexSyncSection';
import { LianLiFlexThermalAlertSection } from './LianLiFlexThermalAlertSection';
import { LianLiFlexApplyAllRow } from './LianLiFlexApplyAllRow';
import type { LianLiFlexSync, LianLiFlexThermalAlert } from '../../../api/lianli-flex';

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

const mockGetSync = vi.fn();
const mockSetSync = vi.fn();
const mockGetAlert = vi.fn();
const mockSetAlert = vi.fn();
const mockApplyAll = vi.fn();

vi.mock('../../../api/lianli-flex', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/lianli-flex')>()),
  getLianLiFlexSync: (...a: any[]) => mockGetSync(...a),
  setLianLiFlexSync: (...a: any[]) => mockSetSync(...a),
  getLianLiFlexThermalAlert: (...a: any[]) => mockGetAlert(...a),
  setLianLiFlexThermalAlert: (...a: any[]) => mockSetAlert(...a),
  applyLianLiFlexToAll: (...a: any[]) => mockApplyAll(...a),
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

const alert = (extra: Partial<LianLiFlexThermalAlert> = {}): LianLiFlexThermalAlert => ({
  enabled: true,
  cpu: { enabled: true, threshold: 80, color: '#ff0000' },
  gpu: { enabled: false, threshold: 80, color: '#0000ff' },
  unit: 'c', members: [], active: { source: null, since: null }, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSync.mockResolvedValue(sync());
  mockSetSync.mockResolvedValue(true);
  mockGetAlert.mockResolvedValue(alert());
  mockSetAlert.mockResolvedValue(true);
  mockApplyAll.mockResolvedValue({ ok: true, applied: [], skipped: [] });
});

describe('LianLiFlexSyncSection', () => {
  function Harness() {
    const sync = useLianLiFlexSync(true);
    return <LianLiFlexSyncSection sync={sync} />;
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
    fireEvent.click(screen.getByLabelText('devices.lianli-flex.syncMemberDirection:{"fan":"TL Flex"}'));
    await act(async () => { fireEvent.click(await screen.findByRole('option', { name: 'devices.lianli.directionRtl' })); });
    expect(mockSetSync).toHaveBeenCalledWith({
      members: [{ mac: 'AA11', sliceDirection: 1 }, { mac: 'BB22', sliceDirection: 1 }],
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

describe('LianLiFlexThermalAlertSection', () => {
  const units = [{ mac: 'AA11', title: 'TL Flex' }, { mac: 'BB22', title: 'SL-INF Flex' }];
  const renderAlert = async (u = units) => { await act(async () => { render(<LianLiFlexThermalAlertSection units={u} />); }); };

  it('renders nothing on a service without the route', async () => {
    mockGetAlert.mockResolvedValue(null);
    await renderAlert();
    expect(screen.queryByText('devices.lianli-flex.thermalSection')).not.toBeInTheDocument();
  });

  it('turns the alert on and off with a toggle', async () => {
    await renderAlert();
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.thermalEnable' })); });
    expect(mockSetAlert).toHaveBeenCalledWith({ enabled: false });
  });

  it('toggles one source', async () => {
    await renderAlert();
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.thermalSourceToggle:{"source":"devices.lianli-flex.sourceGpu"}' }));
    });
    expect(mockSetAlert).toHaveBeenCalledWith({ gpu: { enabled: true } });
  });

  it('shows the idle state, and the active source once it triggers', async () => {
    await renderAlert();
    expect(screen.getByText('devices.lianli-flex.thermalIdle')).toBeInTheDocument();
    document.body.innerHTML = '';
    mockGetAlert.mockResolvedValue(alert({ active: { source: 'gpu', since: 1 } }));
    await renderAlert();
    expect(screen.getByText('devices.lianli-flex.thermalActive:{"source":"devices.lianli-flex.sourceGpu"}')).toBeInTheDocument();
  });

  it('greys out the thresholds of a disabled source and the whole group when off', async () => {
    await renderAlert();
    const gpuSlider = screen.getByRole('slider', { name: 'devices.lianli-flex.thermalThreshold:{"source":"devices.lianli-flex.sourceGpu"}' });
    expect(gpuSlider).toBeDisabled();
    const cpuSlider = screen.getByRole('slider', { name: 'devices.lianli-flex.thermalThreshold:{"source":"devices.lianli-flex.sourceCpu"}' });
    expect(cpuSlider).not.toBeDisabled();
    expect(cpuSlider).toHaveAttribute('min', '1');
    expect(cpuSlider).toHaveAttribute('max', '110');
  });

  it('stores all fans as the empty list and a subset by MAC', async () => {
    mockGetAlert.mockResolvedValue(alert({ members: [] }));
    await renderAlert();
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.thermalMember:{"fan":"SL-INF Flex"}' }));
    });
    expect(mockSetAlert).toHaveBeenLastCalledWith({ members: ['AA11'] });
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'devices.lianli-flex.thermalMember:{"fan":"SL-INF Flex"}' }));
    });
    expect(mockSetAlert).toHaveBeenLastCalledWith({ members: [] });
  });

  it('lays the CPU and GPU colors out side by side like the effect palette', async () => {
    await renderAlert();
    const pickers = screen.getAllByLabelText('common.hexColor');
    expect(pickers).toHaveLength(2);
    expect(pickers[0].closest('[class*="colorPairRow"]')).toBe(pickers[1].closest('[class*="colorPairRow"]'));
  });

  it('has no fan list for a single unit', async () => {
    await renderAlert([units[0]]);
    expect(screen.queryByText(/thermalMember/)).not.toBeInTheDocument();
  });
});

describe('LianLiFlexApplyAllRow for lighting', () => {
  it('sends lighting with the family scope by default after confirming', async () => {
    const onApplied = vi.fn();
    await act(async () => { render(<LianLiFlexApplyAllRow mac="AA11" what="lighting" onApplied={onApplied} />); });
    expect(screen.getByText('devices.lianli-flex.applyAllLightingHint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.applyAllButton' }));
    expect(await screen.findByText('devices.lianli-flex.applyAllConfirmLighting')).toBeInTheDocument();
    const dialogButtons = screen.getAllByRole('button', { name: 'devices.lianli-flex.applyAllButton' });
    await act(async () => { fireEvent.click(dialogButtons[dialogButtons.length - 1]); });
    expect(mockApplyAll).toHaveBeenCalledWith('AA11', ['lighting'], 'family');
    expect(onApplied).toHaveBeenCalled();
  });

  it('cancelling sends nothing', async () => {
    await act(async () => { render(<LianLiFlexApplyAllRow mac="AA11" what="lighting" onApplied={vi.fn()} />); });
    fireEvent.click(screen.getByRole('button', { name: 'devices.lianli-flex.applyAllButton' }));
    await screen.findByText('devices.lianli-flex.applyAllConfirmTitle');
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    expect(mockApplyAll).not.toHaveBeenCalled();
  });

  it('lists how many fans were skipped', async () => {
    mockApplyAll.mockResolvedValue({ ok: true, applied: ['BB'], skipped: ['CC', 'DD'] });
    const { container } = render(<LianLiFlexApplyAllRow mac="AA11" what="lighting" onApplied={vi.fn()} />);
    fireEvent.click(within(container).getByRole('button', { name: 'devices.lianli-flex.applyAllButton' }));
    await act(async () => {
      const buttons = await screen.findAllByRole('button', { name: 'devices.lianli-flex.applyAllButton' });
      fireEvent.click(buttons[buttons.length - 1]);
    });
    expect(screen.getByRole('status')).toHaveTextContent('applyAllSkipped:{"count":2}');
  });
});

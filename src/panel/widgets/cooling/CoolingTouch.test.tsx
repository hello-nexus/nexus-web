import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PanelDeviceIdProvider } from '../common/PanelDeviceIdContext';
import { CoolingTouch } from './CoolingTouch';
import type { PanelWidget } from '../../types';

// The immersive view renders outside I18nProvider in tests, so t() falls back
// to raw keys - assertions below match keys, not English strings.

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({
      channels: [
        {
          id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Curve',
          classification: 'Controllable', calibrated: true,
        },
        {
          id: 'fan-case', name: 'Case Fan', dutyPercent: 30, rpm: 820, mode: 'Auto',
          classification: 'Controllable', calibrated: true,
        },
        {
          id: 'fan-dead', name: 'Dead Header', dutyPercent: 0, rpm: 0, mode: 'Auto',
          classification: 'Unresponsive', calibrated: true,
        },
      ],
    })),
    fetchTemperatureSources: vi.fn(async () => ({
      sources: [
        { id: 'cpu-package', name: 'CPU Package', category: 'CPU', value: 52 },
        { id: 'gpu-core', name: 'GPU Core', category: 'GPU', value: 47 },
      ],
    })),
    fetchCurves: vi.fn(async () => ({
      globalSpeedModifier: 1,
      curves: [
        {
          id: 'curve-1', name: 'My Graph Curve', type: 'Graph',
          input: { id: 'cpu-package', type: 'Temperature', device: '' },
          outputs: [{ id: 'fan-cpu', type: 'Fan' }],
          flat: null,
          linear: null,
          graph: {
            responseTime: 1.5, speedModifier: 1,
            points: [
              { temp: 30, speed: 25 }, { temp: 50, speed: 40 },
              { temp: 70, speed: 70 }, { temp: 90, speed: 100 },
            ],
          },
          mixed: null,
          preset: null,
          isDefault: null,
        },
      ],
    })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'balanced' })),
    applyProfile: vi.fn(async () => undefined),
    saveCurves: vi.fn(async () => undefined),
    releaseFanAuto: vi.fn(async () => undefined),
    renameFan: vi.fn(async () => undefined),
    resetPresetCurve: vi.fn(async () => undefined),
    setFanSpeed: vi.fn(async () => undefined),
  };
});

vi.mock('../../../api/np50', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/np50')>();
  return {
    ...original,
    getNp50ConnectionState: vi.fn(async () => null),
    setNp50FirmwareControl: vi.fn(async () => undefined),
    setNp50LiveCoolingMode: vi.fn(async () => undefined),
  };
});

vi.mock('../../../api/minihub', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/minihub')>();
  return {
    ...original,
    setMiniHubLiveCoolingMode: vi.fn(async () => undefined),
  };
});

import { applyProfile, fetchFanChannels } from '../../../api/cooling';

// The service's panel records, by panel id.
const panelRecords = vi.hoisted(() => ({ current: {} as Record<string, Record<string, string[]>> }));
vi.mock('../../../api/panel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/panel')>()),
  fetchPanelDevice: vi.fn(async (id: string) => (panelRecords.current[id] ? { id, ...panelRecords.current[id] } : null)),
  patchPanelDevice: vi.fn(async (id: string, patch: Record<string, string[]>) => {
    panelRecords.current[id] = { ...panelRecords.current[id], ...patch };
    return { id, ...panelRecords.current[id] };
  }),
}));

const widget = { id: 'w-cooling', type: 'cooling', size: '4x4', col: 0, row: 0 } as PanelWidget;

function renderTouch(panelId: string | null = null) {
  return render(
    <PanelDeviceIdProvider value={panelId}>
      <CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />
    </PanelDeviceIdProvider>,
  );
}

describe('CoolingTouch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Isolate the shared cooling cache + fan-group collapse persistence.
    localStorage.clear();
    panelRecords.current = {};
  });

  it('renders preset mode buttons with the active preset hydrated from /cooling/profiles', async () => {
    renderTouch();
    const balanced = await screen.findByRole('button', { name: 'cooling.mode.balanced' });
    await waitFor(() => expect(balanced).toHaveAttribute('aria-pressed', 'true'));
    for (const key of ['off', 'silent', 'turbo', 'custom']) {
      expect(screen.getByRole('button', { name: `cooling.mode.${key}` }))
        .toHaveAttribute('aria-pressed', 'false');
    }
    // Live trend chart frames cell 1 under the buttons: title hidden in the
    // immersive (too narrow), the CPU/GPU legend carries the row instead.
    expect(screen.queryByText('cooling.trend.title')).toBeNull();
    expect(screen.getByText('cooling.status.cpu')).toBeInTheDocument();
    expect(screen.getByText('cooling.status.gpu')).toBeInTheDocument();
  });

  // Two tabs from the lighting immersive's shared editor shell. Curves leads,
  // so a fresh open lands on the graph.
  it('splits the editor into a Devices and a Curves tab, opening on Curves', async () => {
    renderTouch();
    const devicesTab = await screen.findByRole('tab', { name: 'lighting.rightPane.devices' });
    const curvesTab = screen.getByRole('tab', { name: 'cooling.label.curves' });
    expect(curvesTab).toHaveAttribute('aria-selected', 'true');
    expect(devicesTab).toHaveAttribute('aria-selected', 'false');
    // Cooling has no third pane to tune, unlike lighting.
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('shows the curve selector above the graph, over the curve options', async () => {
    renderTouch();
    // The selected curve's chip carries aria-current; the dashed add chip and
    // the curve-type radio chips come from the shared pinned CurveCard.
    const chip = await screen.findByRole('button', { name: 'My Graph Curve' });
    await waitFor(() => expect(chip).toHaveAttribute('aria-current', 'true'));
    const addChip = screen.getByRole('button', { name: /cooling.curves.add/ });
    const options = screen.getByRole('radiogroup', { name: 'cooling.curve.type.label' });
    expect(options).toBeInTheDocument();
    // Document order is the layout contract: chips first, then the card.
    expect(chip.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(addChip.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lists connected fans on the Devices tab and hides unresponsive hardware', async () => {
    renderTouch();
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    expect(await screen.findByText('CPU Fan')).toBeInTheDocument();
    expect(screen.getByText('Case Fan')).toBeInTheDocument();
    expect(screen.queryByText('Dead Header')).toBeNull();
  });

  it('groups external-hub fans under a collapsible device header', async () => {
    const { fetchFanChannels } = await import('../../../api/cooling');
    vi.mocked(fetchFanChannels).mockResolvedValueOnce({
      channels: [
        {
          id: 'fan-cpu', name: 'CPU Fan', dutyPercent: 42, rpm: 1180, mode: 'Curve',
          classification: 'Controllable', calibrated: true,
        },
        {
          id: 'hub-1', name: 'Hub Fan 1', dutyPercent: 35, rpm: 900, mode: 'Auto',
          classification: 'Controllable', calibrated: true,
          deviceId: 'np50:AB12', deviceName: 'HYTE NP50',
        },
        {
          id: 'hub-2', name: 'Hub Fan 2', dutyPercent: 35, rpm: 910, mode: 'Auto',
          classification: 'Controllable', calibrated: true,
          deviceId: 'np50:AB12', deviceName: 'HYTE NP50',
        },
      ],
    } as Awaited<ReturnType<typeof fetchFanChannels>>);
    renderTouch();
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    const groupToggle = await screen.findByRole('button', { name: 'HYTE NP50' });
    expect(groupToggle).toBeInTheDocument();
    expect(await screen.findByText('Hub Fan 1')).toBeInTheDocument();
    // Collapsing the hub group hides its fans but not the motherboard fan.
    fireEvent.click(groupToggle);
    expect(screen.queryByText('Hub Fan 1')).toBeNull();
    expect(screen.getByText('CPU Fan')).toBeInTheDocument();
  });

  // The lighting device picker's shape: bulk buttons over selectable cards.
  it('selects every fan and clears the selection from the Devices tab', async () => {
    renderTouch();
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    const selectAll = await screen.findByRole('button', { name: /lighting.ledMap.selectAll/ });
    const selectNone = screen.getByRole('button', { name: /lighting.ledMap.selectNone/ });
    // Nothing selected yet, so only select-all is live.
    expect(selectNone).toBeDisabled();

    fireEvent.click(selectAll);
    await waitFor(() => expect(selectAll).toBeDisabled());
    expect(selectNone).toBeEnabled();
    // The unresponsive header is not listed, so it never joins the selection.
    expect(JSON.parse(localStorage.getItem('nexus.cooling.selectedFans.immersive') ?? '[]').sort())
      .toEqual(['fan-case', 'fan-cpu']);

    fireEvent.click(selectNone);
    await waitFor(() => expect(selectNone).toBeDisabled());
    expect(JSON.parse(localStorage.getItem('nexus.cooling.selectedFans.immersive') ?? '[]')).toEqual([]);
  });

  it('shows only the fans that are listed without forgetting a stored one', async () => {
    localStorage.setItem('nexus.cooling.selectedFans.immersive', JSON.stringify(['fan-cpu', 'ghost-fan']));
    renderTouch();
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    expect(await screen.findByRole('button', { name: /lighting.ledMap.selectNone/ })).toBeEnabled();
    expect(JSON.parse(localStorage.getItem('nexus.cooling.selectedFans.immersive') ?? '[]')).toEqual(['fan-cpu', 'ghost-fan']);
  });

  it.each([null, 'panel-a'])('never shares its selection with the desktop Cooling page (panel %s)', async panelId => {
    localStorage.setItem('nexus.cooling.selectedFans', JSON.stringify(['fan-cpu']));
    renderTouch(panelId);
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    const selectAll = await screen.findByRole('button', { name: /lighting.ledMap.selectAll/ });
    expect(screen.getByRole('button', { name: /lighting.ledMap.selectNone/ })).toBeDisabled();
    fireEvent.click(selectAll);
    await waitFor(() => expect(selectAll).toBeDisabled());
    expect(JSON.parse(localStorage.getItem('nexus.cooling.selectedFans') ?? '[]')).toEqual(['fan-cpu']);
  });

  it('desktop: reopening the view restores the selection', async () => {
    const first = renderTouch();
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    fireEvent.click(await screen.findByRole('button', { name: /lighting.ledMap.selectAll/ }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('nexus.cooling.selectedFans.immersive') ?? '[]').sort()).toEqual(['fan-case', 'fan-cpu']));
    first.unmount();

    renderTouch();
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    expect(await screen.findByRole('button', { name: /lighting.ledMap.selectNone/ })).toBeEnabled();
  });

  it('keeps each panel its own selection and restores it from the service on reopen', async () => {
    const a = renderTouch('panel-a');
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    fireEvent.click(await screen.findByRole('button', { name: /lighting.ledMap.selectAll/ }));
    await waitFor(() => expect([...(panelRecords.current['panel-a']?.coolingSelection ?? [])].sort()).toEqual(['fan-case', 'fan-cpu']));
    a.unmount();

    // Another panel and the desktop start with nothing selected.
    const b = renderTouch('panel-b');
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    expect(await screen.findByRole('button', { name: /lighting.ledMap.selectNone/ })).toBeDisabled();
    expect(panelRecords.current['panel-b']).toBeUndefined();
    b.unmount();
    expect(localStorage.getItem('nexus.cooling.selectedFans')).toBeNull();
    expect(localStorage.getItem('nexus.cooling.selectedFans.immersive')).toBeNull();

    localStorage.clear();
    renderTouch('panel-a');
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /lighting.ledMap.selectNone/ })).toBeEnabled());
  });

  it('a panel hides a remembered fan that is gone and keeps it on the record', async () => {
    panelRecords.current['panel-a'] = { coolingSelection: ['fan-cpu', 'ghost-fan'] };
    renderTouch('panel-a');
    fireEvent.click(await screen.findByRole('tab', { name: 'lighting.rightPane.devices' }));
    expect(await screen.findByRole('button', { name: /lighting.ledMap.selectNone/ })).toBeEnabled();
    expect(panelRecords.current['panel-a'].coolingSelection).toEqual(['fan-cpu', 'ghost-fan']);
  });

  // A hub's cooling mode is one byte for the whole hub, and a curve cannot
  // drive it from firmware mode - so the batch assign hands the hub over once.
  it('switches a hub to software once when a curve is bound to several of its fans', async () => {
    const { setNp50LiveCoolingMode } = await import('../../../api/np50');
    const { getNp50ConnectionState } = await import('../../../api/np50');
    vi.mocked(getNp50ConnectionState).mockResolvedValueOnce({
      deviceId: 'np50:AB12', coolingMode: 'Motherboard',
    } as Awaited<ReturnType<typeof getNp50ConnectionState>>);
    // Once, not for the rest of the file: clearAllMocks resets calls, not impls.
    vi.mocked(fetchFanChannels).mockResolvedValueOnce({
      channels: [
        { id: 'hub-1', name: 'Hub Fan 1', dutyPercent: 35, rpm: 900, mode: 'Auto',
          classification: 'Controllable', calibrated: true, deviceId: 'np50:AB12', deviceName: 'HYTE NP50' },
        { id: 'hub-2', name: 'Hub Fan 2', dutyPercent: 35, rpm: 910, mode: 'Auto',
          classification: 'Controllable', calibrated: true, deviceId: 'np50:AB12', deviceName: 'HYTE NP50' },
      ],
    });
    localStorage.setItem('nexus.cooling.selectedFans.immersive', JSON.stringify(['hub-1', 'hub-2']));
    renderTouch();

    fireEvent.click(await screen.findByRole('button', { name: 'My Graph Curve' }));

    await waitFor(() => expect(setNp50LiveCoolingMode).toHaveBeenCalled());
    expect(setNp50LiveCoolingMode).toHaveBeenCalledTimes(1);
  });

  it('applies a preset optimistically on tap', async () => {
    renderTouch();
    const turbo = await screen.findByRole('button', { name: 'cooling.mode.turbo' });
    fireEvent.click(turbo);
    expect(turbo).toHaveAttribute('aria-pressed', 'true');
    expect(applyProfile).toHaveBeenCalledWith('turbo');
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CoolingTouch } from './CoolingTouch';
import type { FanChannel } from '../../../api/cooling';
import type { PanelWidget } from '../../types';

// The immersive view renders outside I18nProvider in tests, so t() falls back
// to raw keys - assertions below match keys, not English strings.

const FANS: FanChannel[] = [
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
];

vi.mock('../../../api/cooling', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../api/cooling')>();
  return {
    ...original,
    fetchFanChannels: vi.fn(async () => ({ channels: FANS })),
    fetchProfiles: vi.fn(async () => ({ profiles: [], active: 'balanced' })),
    applyProfile: vi.fn(async () => undefined),
    setFanControlled: vi.fn(async () => undefined),
    setFanLock: vi.fn(async () => undefined),
  };
});

import { applyProfile, fetchFanChannels, fetchProfiles, setFanControlled, setFanLock } from '../../../api/cooling';

const widget = { id: 'w-cooling', type: 'cooling', size: '4x4', col: 0, row: 0 } as PanelWidget;

function renderTouch() {
  return render(<CoolingTouch widget={widget} immersiveGrid={{ columns: 4, rows: 8 }} />);
}

// A tile's accessible name is its label followed by its description.
const tile = (key: string) => screen.findByRole('button', { name: new RegExp(`^cooling\\.mode\\.${key}`) });

describe('CoolingTouch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchFanChannels).mockResolvedValue({ channels: FANS });
    vi.mocked(fetchProfiles).mockResolvedValue({ profiles: [], active: 'balanced' });
    // Isolate the shared cooling cache.
    localStorage.clear();
  });

  it('renders the simple-mode tiles with the active mode hydrated from /cooling/profiles', async () => {
    renderTouch();
    const balanced = await tile('balanced');
    await waitFor(() => expect(balanced).toHaveAttribute('aria-pressed', 'true'));
    for (const key of ['silent', 'turbo', 'off']) {
      expect(await tile(key)).toHaveAttribute('aria-pressed', 'false');
    }
    // Custom means editing curves - an advanced-mode concept with no tile here.
    expect(screen.queryByRole('button', { name: /cooling\.mode\.custom/ })).toBeNull();
    // The live trend chart frames the fill cell: title hidden in the
    // immersive (too narrow), the CPU/GPU legend carries the row instead.
    expect(screen.queryByText('cooling.trend.title')).toBeNull();
    expect(screen.getByText('cooling.status.cpu')).toBeInTheDocument();
    expect(screen.getByText('cooling.status.gpu')).toBeInTheDocument();
  });

  it('reads out every connected fan and hides unresponsive hardware', async () => {
    renderTouch();
    expect(await screen.findByText('CPU Fan')).toBeInTheDocument();
    expect(screen.getByText('Case Fan')).toBeInTheDocument();
    expect(screen.queryByText('Dead Header')).toBeNull();
    // The number on a row is the fan's live RPM.
    expect(screen.getByRole('img', { name: /1.?180 RPM/ })).toBeInTheDocument();
  });

  it('groups external-hub fans under a collapsible device header', async () => {
    vi.mocked(fetchFanChannels).mockResolvedValue({
      channels: [
        FANS[0],
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
    });
    renderTouch();
    const groupToggle = await screen.findByRole('button', { name: 'HYTE NP50' });
    expect(await screen.findByText('Hub Fan 1')).toBeInTheDocument();
    // Collapsing the hub group hides its fans but not the motherboard fan.
    fireEvent.click(groupToggle);
    expect(screen.queryByText('Hub Fan 1')).toBeNull();
    expect(screen.getByText('CPU Fan')).toBeInTheDocument();
  });

  it('applies a mode optimistically on tap', async () => {
    renderTouch();
    const turbo = await tile('turbo');
    fireEvent.click(turbo);
    expect(turbo).toHaveAttribute('aria-pressed', 'true');
    expect(applyProfile).toHaveBeenCalledWith('turbo');
  });

  it('counts the fans under Nexus Control and claims the rest on demand', async () => {
    vi.mocked(fetchFanChannels).mockResolvedValue({
      channels: [FANS[0], { ...FANS[1], controlled: false }],
    });
    renderTouch();
    expect(await screen.findByText('cooling.simple.controlledOf.other')).toBeInTheDocument();
    // The uncontrolled fan still reads out, marked as such.
    expect(screen.getByText('Case Fan · cooling.fan.notControlled')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cooling.simple.controlAll' }));
    await waitFor(() => expect(setFanControlled).toHaveBeenCalledWith('fan-case', true));
    expect(setFanControlled).toHaveBeenCalledTimes(1);
  });

  // The modes skip a locked fan and this surface has nowhere to unlock it, so
  // it is released on sight, once, as the desktop simple page does.
  it('unlocks a locked fan once', async () => {
    vi.mocked(fetchFanChannels).mockResolvedValue({
      channels: [FANS[0], { ...FANS[1], locked: true }],
    });
    renderTouch();
    await waitFor(() => expect(setFanLock).toHaveBeenCalledWith('fan-case', false));
    // The refetch after the unlock still reports it locked (mock is static)
    // and must not trigger a second attempt.
    await waitFor(() => expect(fetchFanChannels).toHaveBeenCalledTimes(2));
    expect(setFanLock).toHaveBeenCalledTimes(1);
  });

  it('shows the custom notice while a custom setup is active', async () => {
    vi.mocked(fetchProfiles).mockResolvedValue({ profiles: [], active: 'custom' });
    renderTouch();
    expect(await screen.findByText('cooling.immersive.customActive')).toBeInTheDocument();
    for (const key of ['silent', 'balanced', 'turbo', 'off']) {
      expect(await tile(key)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('reads the BIOS banner instead of the count while cooling is off', async () => {
    vi.mocked(fetchProfiles).mockResolvedValue({ profiles: [], active: 'off' });
    renderTouch();
    expect(await screen.findByText('cooling.mode.off.banner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'cooling.simple.controlAll' })).toBeNull();
  });
});

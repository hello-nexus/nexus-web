import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevSimAstral } from '../../api/devSim';
import { AstralSimCard } from './AstralSimCard';
import { ASTRAL_PRESETS, matchingPreset } from './astralSimPresets';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const api = vi.hoisted(() => ({
  fetchDevSimAstral: vi.fn(),
  setDevSimAstral: vi.fn(),
  stopDevSimAstral: vi.fn(),
}));
vi.mock('../../api/devSim', () => api);

const sim = (over: Partial<DevSimAstral> = {}): DevSimAstral => ({
  active: false, sag: 0, lean: 0, pinAmps: ASTRAL_PRESETS.normal, ...over,
});

async function mount(state: DevSimAstral) {
  api.fetchDevSimAstral.mockResolvedValue(state);
  await act(async () => { render(<AstralSimCard />); });
}

describe('AstralSimCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.setDevSimAstral.mockImplementation(async (patch: object) => sim({ active: true, ...patch }));
    api.stopDevSimAstral.mockResolvedValue(sim());
  });

  it('starts and stops the simulated card', async () => {
    await mount(sim());
    const toggle = screen.getByRole('switch');
    await act(async () => { fireEvent.click(toggle); });
    expect(api.setDevSimAstral).toHaveBeenCalledWith({});
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(api.stopDevSimAstral).toHaveBeenCalled();
  });

  it('disables the controls while the card is off', async () => {
    await mount(sim());
    expect(screen.getAllByRole('slider').every(s => (s as HTMLInputElement).disabled)).toBe(true);
    expect(screen.getByText('tools.simAstral.preset.critical').closest('button')).toBeDisabled();
  });

  it('sends a preset as the six pin currents', async () => {
    await mount(sim({ active: true }));
    await act(async () => { fireEvent.click(screen.getByText('tools.simAstral.preset.dead')); });
    expect(api.setDevSimAstral).toHaveBeenCalledWith({ pinAmps: ASTRAL_PRESETS.dead });
    expect(ASTRAL_PRESETS.dead.filter(a => a === 0)).toHaveLength(1);
  });

  it('has a slider per pin plus sag and lean', async () => {
    await mount(sim({ active: true }));
    expect(screen.getAllByRole('slider')).toHaveLength(8);
  });

  it('names the preset the currents match, and none once they differ', () => {
    expect(matchingPreset(ASTRAL_PRESETS.critical)).toBe('critical');
    expect(matchingPreset([1, 2, 3, 4, 5, 6])).toBe('');
  });
});

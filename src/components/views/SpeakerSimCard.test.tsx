import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevSimSpeaker } from '../../api/devSim';
import { SpeakerSimCard } from './SpeakerSimCard';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key) }),
}));

const api = vi.hoisted(() => ({
  fetchDevSimSpeaker: vi.fn(),
  startDevSimSpeaker: vi.fn(),
  stopDevSimSpeaker: vi.fn(),
}));
vi.mock('../../api/devSim', () => api);

const sim = (over: Partial<DevSimSpeaker> = {}): DevSimSpeaker => ({ active: false, testsPlayed: 0, ...over });

describe('SpeakerSimCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.startDevSimSpeaker.mockResolvedValue(sim({ active: true }));
    api.stopDevSimSpeaker.mockResolvedValue(sim());
  });

  it('starts and stops the simulated speaker', async () => {
    api.fetchDevSimSpeaker.mockResolvedValue(sim());
    await act(async () => { render(<SpeakerSimCard />); });
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(api.startDevSimSpeaker).toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(api.stopDevSimSpeaker).toHaveBeenCalled();
  });

  it('counts the test sounds while active', async () => {
    api.fetchDevSimSpeaker.mockResolvedValue(sim({ active: true, testsPlayed: 3 }));
    await act(async () => { render(<SpeakerSimCard />); });
    expect(screen.getByText('tools.simSpeaker.tests:{"count":3}')).toBeInTheDocument();
  });

  it('shows an error when the service does not answer the toggle, and nothing when the first read fails with no card', async () => {
    api.fetchDevSimSpeaker.mockResolvedValue(sim());
    await act(async () => { render(<SpeakerSimCard />); });
    api.startDevSimSpeaker.mockResolvedValue(null);
    await act(async () => { fireEvent.click(screen.getByRole('switch')); });
    expect(screen.getByText('tools.simSpeaker.error')).toBeInTheDocument();
  });
});

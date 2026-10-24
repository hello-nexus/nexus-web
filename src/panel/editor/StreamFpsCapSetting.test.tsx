import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StreamFpsCapSetting } from './StreamFpsCapSetting';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

const api = vi.hoisted(() => ({ fetchStreamSettings: vi.fn(), setStreamFpsCap: vi.fn() }));
vi.mock('../../api/panel', () => ({
  fetchStreamSettings: api.fetchStreamSettings,
  setStreamFpsCap: api.setStreamFpsCap,
}));

const toast = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('../../components/common/Toast/Toast', () => ({ useToastSafe: () => toast }));

const LABEL = 'panel.editor.streamFpsCap.title';
const HZ = (hz: number) => `lighting.ledMap.rateCapHz:{"hz":${hz}}`;
const trigger = () => screen.getByRole('button', { name: LABEL });

describe('StreamFpsCapSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the service value and lists Off plus the Hz options', async () => {
    api.fetchStreamSettings.mockResolvedValue({ fpsCap: 30 });
    render(<StreamFpsCapSetting />);
    await waitFor(() => expect(trigger().textContent).toContain(HZ(30)));
    fireEvent.click(trigger());
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([
      'lighting.ledMap.rateCapOff',
      ...[30, 20, 15, 10, 5, 1].map(HZ),
    ]);
  });

  it('shows Off when the service reports no cap', async () => {
    api.fetchStreamSettings.mockResolvedValue({ fpsCap: null });
    render(<StreamFpsCapSetting />);
    await waitFor(() => expect(trigger().textContent).toContain('lighting.ledMap.rateCapOff'));
  });

  it('puts the chosen cap and keeps it', async () => {
    api.fetchStreamSettings.mockResolvedValue({ fpsCap: 30 });
    api.setStreamFpsCap.mockResolvedValue({ fpsCap: 10 });
    render(<StreamFpsCapSetting />);
    await waitFor(() => expect(trigger().textContent).toContain(HZ(30)));
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: HZ(10) }));
    expect(api.setStreamFpsCap).toHaveBeenCalledWith(10);
    await waitFor(() => expect(trigger().textContent).toContain(HZ(10)));
    expect(toast.push).not.toHaveBeenCalled();
  });

  it('puts null for Off', async () => {
    api.fetchStreamSettings.mockResolvedValue({ fpsCap: 30 });
    api.setStreamFpsCap.mockResolvedValue({ fpsCap: null });
    render(<StreamFpsCapSetting />);
    await waitFor(() => expect(trigger().textContent).toContain(HZ(30)));
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: 'lighting.ledMap.rateCapOff' }));
    expect(api.setStreamFpsCap).toHaveBeenCalledWith(null);
  });

  it('reverts and toasts when the save fails', async () => {
    api.fetchStreamSettings.mockResolvedValue({ fpsCap: 30 });
    api.setStreamFpsCap.mockResolvedValue(null);
    render(<StreamFpsCapSetting />);
    await waitFor(() => expect(trigger().textContent).toContain(HZ(30)));
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('option', { name: HZ(5) }));
    await waitFor(() => expect(toast.push).toHaveBeenCalledWith({ title: 'panel.editor.streamFpsCap.failed' }));
    expect(trigger().textContent).toContain(HZ(30));
  });

  it('renders nothing when the service has no route', async () => {
    api.fetchStreamSettings.mockResolvedValue(null);
    const { container } = render(<StreamFpsCapSetting />);
    await waitFor(() => expect(api.fetchStreamSettings).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });
});

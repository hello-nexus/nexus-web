import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchRecent = vi.fn();
vi.mock('../../api/appTelemetry', () => ({ fetchAppTelemetryRecent: () => fetchRecent() }));

import { AppTelemetryCard } from './AppTelemetryCard';

const sample = {
  posthog: 'off',
  events: [{ at: '2026-10-03T10:00:00Z', event: 'app_event', properties: { app_id: 'a.app', event: 'level_done', p_level: 3 } }],
};

beforeEach(() => { vi.useFakeTimers(); fetchRecent.mockResolvedValue(sample); });
afterEach(() => { cleanup(); vi.useRealTimers(); fetchRecent.mockReset(); });

describe('AppTelemetryCard', () => {
  it('lists events and the PostHog status', async () => {
    await act(async () => { render(<AppTelemetryCard />); });
    expect(screen.getByText('tools.appTelemetry.status.off')).toBeTruthy();
    expect(screen.getByText('app_event (level_done)')).toBeTruthy();
    expect(screen.getByText('p_level=3')).toBeTruthy();
  });

  it('polls every 2 seconds and stops on unmount', async () => {
    const { unmount } = render(<AppTelemetryCard />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchRecent).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(fetchRecent).toHaveBeenCalledTimes(3);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(fetchRecent).toHaveBeenCalledTimes(3);
  });

  it('shows the unavailable note when the service cannot be read', async () => {
    fetchRecent.mockResolvedValue(null);
    await act(async () => { render(<AppTelemetryCard />); });
    expect(screen.getByText('tools.appTelemetry.unavailable')).toBeTruthy();
  });
});

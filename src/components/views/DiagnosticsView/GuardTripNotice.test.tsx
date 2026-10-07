import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardResponse } from '../../../api/cooling';
import { GuardTripNotice, GuardTripNoticeView } from './GuardTripNotice';

// Rendered outside I18nProvider, so t() returns raw keys.

const api = vi.hoisted(() => ({ fetchGuard: vi.fn(), acknowledgeGuardTrip: vi.fn() }));

vi.mock('../../../api/cooling', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/cooling')>()),
  ...api,
}));
vi.mock('../../../hooks/useMultiplexSocket', () => ({ useTopicCallback: () => {} }));

const guard = (trip: Partial<NonNullable<GuardResponse['lastTrip']>> | null): GuardResponse => ({
  state: 'normal', guardTempC: 50, limitC: 95, limitSource: 'spec', sinceUtcMs: null,
  lastTrip: trip === null ? null : {
    atUtcMs: 1_760_000_000_000, peakC: 93.4, reason: 'limit', escalated: false,
    endedAtUtcMs: 1_760_000_600_000, acknowledged: false, ...trip,
  },
  heal: { undoAvailable: false, healedAtUtcMs: null, channels: [] },
});

describe('GuardTripNoticeView', () => {
  it('shows nothing without a trip or once acknowledged', () => {
    const { container, rerender } = render(<GuardTripNoticeView guard={guard(null)} error={null} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
    rerender(<GuardTripNoticeView guard={guard({ acknowledged: true })} error={null} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('an ended trip shows the time, peak and cause, with Dismiss', () => {
    const onDismiss = vi.fn();
    render(<GuardTripNoticeView guard={guard({})} error={null} onDismiss={onDismiss} />);
    expect(screen.getByText('diagnostics.cooling.guardTrip.ended')).toBeTruthy();
    expect(screen.getByText('diagnostics.cooling.guardTrip.causeLimit')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.cooling.guardTrip.dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('names a cooling-loss cause', () => {
    render(<GuardTripNoticeView guard={guard({ reason: 'cooling-loss' })} error={null} onDismiss={() => {}} />);
    expect(screen.getByText('diagnostics.cooling.guardTrip.causeLoss')).toBeTruthy();
  });

  it('an active trip shows the active line and an Open Cooling link, with no Dismiss', () => {
    const onOpen = vi.fn();
    render(<GuardTripNoticeView guard={guard({ endedAtUtcMs: null })} error={null} onDismiss={() => {}} onOpenCooling={onOpen} />);
    expect(screen.getByText('diagnostics.cooling.guardTrip.active')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'diagnostics.cooling.guardTrip.dismiss' })).toBeNull();
    const link = screen.getByRole('link', { name: 'diagnostics.cooling.guardTrip.openCooling' });
    expect(link.getAttribute('href')).toBe('/system/cooling');
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalled();
  });

  it('shows an inline error', () => {
    render(<GuardTripNoticeView guard={guard({})} error="failed" onDismiss={() => {}} />);
    expect(screen.getByRole('alert').textContent).toBe('failed');
  });
});

describe('GuardTripNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchGuard.mockResolvedValue(guard({}));
  });

  it('Dismiss acknowledges, applies the returned guard and tells the view to refresh', async () => {
    api.acknowledgeGuardTrip.mockResolvedValue(guard({ acknowledged: true }));
    const onDismissed = vi.fn();
    render(<GuardTripNotice serviceOnline onDismissed={onDismissed} />);
    fireEvent.click(await screen.findByRole('button', { name: 'diagnostics.cooling.guardTrip.dismiss' }));
    await waitFor(() => expect(onDismissed).toHaveBeenCalledTimes(1));
    expect(api.acknowledgeGuardTrip).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('diagnostics.cooling.guardTrip.ended')).toBeNull());
  });

  it('a refused acknowledge shows the inline error and keeps the notice', async () => {
    api.acknowledgeGuardTrip.mockResolvedValue({ ...guard({}), error: true, msg: 'The thermal guard is still active.' });
    const onDismissed = vi.fn();
    render(<GuardTripNotice serviceOnline onDismissed={onDismissed} />);
    fireEvent.click(await screen.findByRole('button', { name: 'diagnostics.cooling.guardTrip.dismiss' }));
    await screen.findByText('diagnostics.cooling.guardTrip.error');
    expect(onDismissed).not.toHaveBeenCalled();
    expect(screen.getByText('diagnostics.cooling.guardTrip.ended')).toBeTruthy();
  });
});

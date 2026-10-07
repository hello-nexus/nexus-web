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

// Relative to the real clock: the container reads the fetch time from Date.now().
const RECENT = Date.now() - 60_000;
const NOW = RECENT + 120_000;

const guard = (trip: Partial<NonNullable<GuardResponse['lastTrip']>> | null): GuardResponse => ({
  state: 'normal', guardTempC: 50, limitC: 95, limitSource: 'spec', sinceUtcMs: null,
  lastTrip: trip === null ? null : {
    atUtcMs: RECENT - 600_000, peakC: 93.4, reason: 'limit', escalated: false,
    endedAtUtcMs: RECENT, acknowledged: false, ...trip,
  },
  heal: { undoAvailable: false, healedAtUtcMs: null, channels: [] },
});

describe('GuardTripNoticeView', () => {
  it('shows nothing without a trip or once acknowledged', () => {
    const { container, rerender } = render(<GuardTripNoticeView nowMs={NOW} guard={guard(null)} error={null} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
    rerender(<GuardTripNoticeView nowMs={NOW} guard={guard({ acknowledged: true })} error={null} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('an ended trip shows the time, peak and cause, with Dismiss', () => {
    const onDismiss = vi.fn();
    render(<GuardTripNoticeView nowMs={NOW} guard={guard({})} error={null} onDismiss={onDismiss} />);
    expect(screen.getByText('diagnostics.cooling.guardTrip.ended')).toBeTruthy();
    expect(screen.getByText('diagnostics.cooling.guardTrip.causeLimit')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.cooling.guardTrip.dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('names a cooling-loss cause', () => {
    render(<GuardTripNoticeView nowMs={NOW} guard={guard({ reason: 'cooling-loss' })} error={null} onDismiss={() => {}} />);
    expect(screen.getByText('diagnostics.cooling.guardTrip.causeLoss')).toBeTruthy();
  });

  it('an active trip shows the active line and an Open Cooling button, with no Dismiss', () => {
    const onOpen = vi.fn();
    render(<GuardTripNoticeView nowMs={NOW} guard={guard({ endedAtUtcMs: null })} error={null} onDismiss={() => {}} onOpenCooling={onOpen} />);
    expect(screen.getByText('diagnostics.cooling.guardTrip.active')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'diagnostics.cooling.guardTrip.dismiss' })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'diagnostics.cooling.guardTrip.openCooling' }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('shows no Open Cooling control when the page cannot navigate', () => {
    render(<GuardTripNoticeView nowMs={NOW} guard={guard({ endedAtUtcMs: null })} error={null} onDismiss={() => {}} />);
    expect(screen.queryByRole('button', { name: 'diagnostics.cooling.guardTrip.openCooling' })).toBeNull();
  });

  it('uses the warning tone for both an active and an ended trip', () => {
    const { rerender } = render(<GuardTripNoticeView nowMs={NOW} guard={guard({})} error={null} onDismiss={() => {}} />);
    expect(screen.getByRole('status').getAttribute('data-tone')).toBe('warning');
    rerender(<GuardTripNoticeView nowMs={NOW} guard={guard({ endedAtUtcMs: null })} error={null} onDismiss={() => {}} />);
    expect(screen.getByRole('status').getAttribute('data-tone')).toBe('warning');
  });

  it('shows an inline error', () => {
    render(<GuardTripNoticeView nowMs={NOW} guard={guard({})} error="failed" onDismiss={() => {}} />);
    expect(screen.getByRole('alert').textContent).toBe('failed');
  });
});

describe('GuardTripNoticeView window and pending state', () => {
  it('hides an ended trip older than 24 hours but keeps an active one', () => {
    const old = { atUtcMs: RECENT - 90_000_000, endedAtUtcMs: RECENT - 86_500_000 };
    const { container, rerender } = render(<GuardTripNoticeView nowMs={RECENT} guard={guard(old)} error={null} onDismiss={() => {}} />);
    expect(container.firstChild).toBeNull();
    rerender(<GuardTripNoticeView nowMs={RECENT} guard={guard({ ...old, endedAtUtcMs: null })} error={null} onDismiss={() => {}} />);
    expect(screen.getByText('diagnostics.cooling.guardTrip.active')).toBeTruthy();
  });

  it('disables Dismiss while a dismissal is in flight', () => {
    render(<GuardTripNoticeView nowMs={NOW} dismissing guard={guard({})} error={null} onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: 'diagnostics.cooling.guardTrip.dismiss' })).toBeDisabled();
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
    // The real wire shape of a refusal: the envelope only, no guard fields.
    api.acknowledgeGuardTrip.mockResolvedValue({ error: true, msg: 'The thermal guard is still active.' });
    const onDismissed = vi.fn();
    render(<GuardTripNotice serviceOnline onDismissed={onDismissed} />);
    fireEvent.click(await screen.findByRole('button', { name: 'diagnostics.cooling.guardTrip.dismiss' }));
    await screen.findByText('diagnostics.cooling.guardTrip.error');
    expect(onDismissed).not.toHaveBeenCalled();
    expect(screen.getByText('diagnostics.cooling.guardTrip.ended')).toBeTruthy();
  });

  it('a double click on Dismiss sends one request', async () => {
    let finish!: (v: unknown) => void;
    api.acknowledgeGuardTrip.mockReturnValue(new Promise(r => { finish = r; }));
    render(<GuardTripNotice serviceOnline onDismissed={() => {}} />);
    const button = await screen.findByRole('button', { name: 'diagnostics.cooling.guardTrip.dismiss' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.acknowledgeGuardTrip).toHaveBeenCalledTimes(1);
    finish(guard({ acknowledged: true }));
  });
});

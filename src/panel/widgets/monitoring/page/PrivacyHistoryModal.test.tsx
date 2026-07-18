import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PrivacyHistoryModal } from './PrivacyHistoryModal';
import type { UsePrivacyHistoryResult } from '../../../../hooks/usePrivacyHistory';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';

// No I18nProvider wraps these renders (matches ProcessDetailPanel.test.tsx) -
// useTranslation()'s default context stub returns the raw key, so assertions
// below match keys, not translated English copy.
vi.mock('../../../../hooks/useProcessIcon', () => ({
  useProcessIcon: () => null,
}));

const historyMock = vi.fn<() => UsePrivacyHistoryResult>();
vi.mock('../../../../hooks/usePrivacyHistory', () => ({
  usePrivacyHistory: () => historyMock(),
}));

function result(over: Partial<UsePrivacyHistoryResult> = {}): UsePrivacyHistoryResult {
  return {
    sessions: [],
    retentionDays: 30,
    loading: false,
    error: false,
    mocked: false,
    supported: true,
    reload: vi.fn(),
    ...over,
  };
}

function activeSession(over: Partial<PrivacySession> = {}): PrivacySession {
  return { app: 'C:\\chrome.exe', capability: 'webcam', start: Date.now() - 5_000, end: null, ...over };
}

describe('PrivacyHistoryModal', () => {
  it('renders a session row with the app name and capability', () => {
    historyMock.mockReturnValue(result({ sessions: [activeSession()] }));
    render(<PrivacyHistoryModal open onClose={() => {}} />);

    expect(screen.getByText('chrome')).toBeInTheDocument();
    expect(screen.getByText('monitoring.privacy.capability.webcam')).toBeInTheDocument();
  });

  it('shows the unsupported message when the route reports unsupported', () => {
    historyMock.mockReturnValue(result({ supported: false }));
    render(<PrivacyHistoryModal open onClose={() => {}} />);
    expect(screen.getByText('monitoring.privacy.history.unsupported')).toBeInTheDocument();
  });

  it('shows an error message with a retry button wired to reload()', () => {
    const reload = vi.fn();
    historyMock.mockReturnValue(result({ error: true, reload }));
    render(<PrivacyHistoryModal open onClose={() => {}} />);

    fireEvent.click(screen.getByText('monitoring.history.retry'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not understate an in-use session\'s duration after a close/reopen cycle', () => {
    vi.useFakeTimers();
    try {
      const t0 = Date.parse('2026-01-01T00:00:00Z');
      vi.setSystemTime(t0);
      const start = t0 - 5_000; // the session began 5s before this modal ever mounted
      historyMock.mockReturnValue(result({ sessions: [activeSession({ start })] }));

      const { rerender } = render(<PrivacyHistoryModal open onClose={() => {}} />);
      expect(screen.getByText('diagnostics.duration.seconds')).toBeInTheDocument();

      // MonitoringPage keeps this component mounted across close/reopen -
      // only `open` toggles, the instance never remounts.
      rerender(<PrivacyHistoryModal open={false} onClose={() => {}} />);
      act(() => { vi.setSystemTime(t0 + 20 * 60_000); });
      rerender(<PrivacyHistoryModal open onClose={() => {}} />);

      // A "now" snapshot stuck at first mount would still read the seconds
      // bucket (or clamp to 0) instead of advancing to minutes for this
      // ~20-minute-old still-active session.
      expect(screen.getByText('diagnostics.duration.minutes')).toBeInTheDocument();
      expect(screen.queryByText('diagnostics.duration.seconds')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProcessListSection, type ProcessListItem } from './ProcessListSection';
import type { UseMonitoringPrivacyResult } from '../../../../hooks/useMonitoringPrivacy';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';

const NOW = 10_000_000;

const privacyMock = vi.fn<() => UseMonitoringPrivacyResult>();
vi.mock('../../../../hooks/useMonitoringPrivacy', () => ({
  useMonitoringPrivacy: () => privacyMock(),
}));

function privacyResult(over: Partial<UseMonitoringPrivacyResult> = {}): UseMonitoringPrivacyResult {
  return {
    sessions: [],
    asOfMs: NOW,
    loading: false,
    error: false,
    mocked: false,
    supported: true,
    ...over,
  };
}

function items(): ProcessListItem[] {
  return [
    { name: 'Chrome', color: '#f00', current: 12, values: [1, 2, 3] },
    { name: 'AppControl', color: '#0f0', current: 40, values: [4, 5, 6] },
    { name: 'Nexus', color: '#00f', current: 3, values: [1, 1, 1] },
  ];
}

describe('ProcessListSection', () => {
  beforeEach(() => {
    privacyMock.mockReturnValue(privacyResult());
  });

  it('renders rows sorted by usage (current value) descending by default', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    const names = screen.getAllByText(/Chrome|AppControl|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['AppControl', 'Chrome', 'Nexus']);
  });

  it('filters rows live by name via the search input', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'chr' } });
    expect(screen.getByText('Chrome')).toBeInTheDocument();
    expect(screen.queryByText('AppControl')).toBeNull();
    expect(screen.queryByText('Nexus')).toBeNull();
  });

  it('search is case-insensitive', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'NEXUS' } });
    expect(screen.getByText('Nexus')).toBeInTheDocument();
  });

  it('switches to alphabetical sort via the sort dropdown', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.click(screen.getByRole('button', { name: 'monitoring.history.process.sortAriaLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.history.process.sortName' }));
    const names = screen.getAllByText(/Chrome|AppControl|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['AppControl', 'Chrome', 'Nexus']);
  });

  it('shows the current value formatted via formatValue', () => {
    render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} />);
    expect(screen.getByText('12%')).toBeInTheDocument();
  });

  it('renders an optional secondary value inline', () => {
    render(<ProcessListSection items={[{ ...items()[0], secondary: '512 MB' }]} formatValue={v => `${v}%`} />);
    expect(screen.getByText('512 MB')).toBeInTheDocument();
  });

  it('omits the secondary value when absent', () => {
    const { container } = render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} />);
    expect(container.textContent).not.toContain('undefined');
  });

  it('shows the empty message when no items match', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'zzz' } });
    expect(screen.getByText('monitoring.ranked.empty')).toBeInTheDocument();
  });

  it('shows the empty message for an empty item list', () => {
    render(<ProcessListSection items={[]} formatValue={v => `${v}%`} />);
    expect(screen.getByText('monitoring.ranked.empty')).toBeInTheDocument();
  });

  it('shows no privacy icon for a row with no matching session', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\firefox.exe', capability: 'webcam', start: NOW - 1000, end: null }];
    privacyMock.mockReturnValue(privacyResult({ sessions }));
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    expect(screen.queryByRole('img', { name: 'monitoring.privacy.capability.webcam' })).toBeNull();
  });

  it('shows an accented privacy icon for an active session', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
    privacyMock.mockReturnValue(privacyResult({ sessions }));
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    const icon = screen.getByRole('img', { name: 'monitoring.privacy.capability.webcam' });
    expect(icon.className).toContain('privacyIconActive');
  });

  it('shows a dimmed privacy icon for a session that ended within the last hour', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'microphone', start: NOW - 20 * 60_000, end: NOW - 10 * 60_000 }];
    privacyMock.mockReturnValue(privacyResult({ sessions }));
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    const icon = screen.getByRole('img', { name: 'monitoring.privacy.capability.microphone' });
    expect(icon.className).toContain('privacyIconRecent');
  });

  it('does not show a privacy icon for a session that ended over an hour ago', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 3 * 3_600_000, end: NOW - 2 * 3_600_000 }];
    privacyMock.mockReturnValue(privacyResult({ sessions }));
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    expect(screen.queryByRole('img', { name: 'monitoring.privacy.capability.webcam' })).toBeNull();
  });

  it('the tooltip shows "since" for an active session', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
    privacyMock.mockReturnValue(privacyResult({ sessions }));
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.focus(screen.getByRole('img', { name: 'monitoring.privacy.capability.webcam' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('monitoring.privacy.since');
  });

  it('the tooltip shows "until" for a session that already ended', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 20 * 60_000, end: NOW - 10 * 60_000 }];
    privacyMock.mockReturnValue(privacyResult({ sessions }));
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.focus(screen.getByRole('img', { name: 'monitoring.privacy.capability.webcam' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('monitoring.privacy.until');
  });

  it('merges both screen-capture capabilities into one indicator whose tooltip names each session', () => {
    const sessions: PrivacySession[] = [
      { app: 'C:\\chrome.exe', capability: 'graphicsCaptureProgrammatic', start: NOW - 1000, end: null },
      { app: 'C:\\chrome.exe', capability: 'graphicsCaptureWithoutBorder', start: NOW - 2000, end: NOW - 1500 },
    ];
    privacyMock.mockReturnValue(privacyResult({ sessions }));
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    expect(screen.getAllByRole('img', { name: 'monitoring.privacy.icon.screen' })).toHaveLength(1);

    fireEvent.focus(screen.getByRole('img', { name: 'monitoring.privacy.icon.screen' }));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('monitoring.privacy.capability.graphicsCaptureProgrammatic');
    expect(tooltip).toHaveTextContent('monitoring.privacy.capability.graphicsCaptureWithoutBorder');
  });

  it('does not render a privacy icon when the route is unsupported', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
    privacyMock.mockReturnValue(privacyResult({ sessions, supported: false }));
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    expect(screen.queryByRole('img', { name: 'monitoring.privacy.capability.webcam' })).toBeNull();
  });

  it('hides privacy icons while the poll is in an error state instead of freezing stale data', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
    privacyMock.mockReturnValue(privacyResult({ sessions, error: true }));
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    expect(screen.queryByRole('img', { name: 'monitoring.privacy.capability.webcam' })).toBeNull();
  });
});

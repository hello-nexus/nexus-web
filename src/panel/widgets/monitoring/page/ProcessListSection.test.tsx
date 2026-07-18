import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProcessListSection, type ProcessListItem } from './ProcessListSection';
import { reconcileLiveWithWindow } from './appWindowHelpers';
import type { AppWindowSeries } from '../../../../api/monitoringHistoryApps';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';

const NOW = 10_000_000;

const processIconMock = vi.fn<(name: string) => string | null>();
vi.mock('../../../../hooks/useProcessIcon', () => ({
  useProcessIcon: (name: string) => processIconMock(name),
}));

// Counts real Sparkline renders (a direct signal of ProcessRow's own memo
// bypassing unchanged rows) while still rendering its real output, so every
// other test in this file that asserts on the sparkline's actual SVG output
// is unaffected.
let sparklineRenderCount = 0;
vi.mock('../../../../components/common/Sparkline/Sparkline', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../../components/common/Sparkline/Sparkline')>();
  return {
    ...actual,
    Sparkline: (props: Parameters<typeof actual.Sparkline>[0]) => {
      sparklineRenderCount++;
      return <actual.Sparkline {...props} />;
    },
  };
});

// MonitoringPage now owns the privacy poll (useMonitoringPrivacy) and passes
// the resolved sessions/asOfMs/showPrivacy down as plain props - this maps a
// {sessions, supported, error} fixture onto those props the same way the
// page itself derives them (showPrivacy = supported && !error).
function privacyProps(over: { sessions?: PrivacySession[]; supported?: boolean; error?: boolean } = {}) {
  return {
    privacySessions: over.sessions ?? [],
    privacyAsOfMs: NOW,
    showPrivacy: (over.supported ?? true) && !(over.error ?? false),
  };
}

const onSelectProcessMock = vi.fn<(name: string) => void>();

function items(): ProcessListItem[] {
  return [
    { name: 'Chrome', current: 12, values: [1, 2, 3] },
    { name: 'AcmeApp', current: 40, values: [4, 5, 6] },
    { name: 'Nexus', current: 3, values: [1, 1, 1] },
  ];
}

describe('ProcessListSection', () => {
  beforeEach(() => {
    processIconMock.mockReturnValue(null);
    onSelectProcessMock.mockReset();
  });

  it('defaults to the recency sort, falling back to usage order when no item reports startedAtMs', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    const names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['AcmeApp', 'Chrome', 'Nexus']);
  });

  it('recency sort ranks by startedAtMs (most recent first) when items report it', () => {
    const withRecency: ProcessListItem[] = [
      { name: 'Chrome', current: 12, values: [], startedAtMs: 1000 },
      { name: 'AcmeApp', current: 40, values: [], startedAtMs: 3000 },
      { name: 'Nexus', current: 3, values: [], startedAtMs: 2000 },
    ];
    render(<ProcessListSection items={withRecency} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    const names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['AcmeApp', 'Nexus', 'Chrome']);
  });

  it('sorts an app with a known launch time above one without, under the recency sort', () => {
    const mixed: ProcessListItem[] = [
      { name: 'Chrome', current: 90, values: [] },
      { name: 'AcmeApp', current: 1, values: [], startedAtMs: 1000 },
    ];
    render(<ProcessListSection items={mixed} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    const names = screen.getAllByText(/Chrome|AcmeApp/).map(el => el.textContent);
    expect(names).toEqual(['AcmeApp', 'Chrome']);
  });

  it('switches to usage sort via the sort dropdown', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    fireEvent.click(screen.getByRole('button', { name: 'monitoring.history.process.sortAriaLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.history.process.sortUsage' }));
    const names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['AcmeApp', 'Chrome', 'Nexus']);
  });

  it('renders the app icon in place of the dot when one resolves', () => {
    processIconMock.mockImplementation(name => (name === 'Chrome' ? 'blob:chrome-icon' : null));
    const { container } = render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    const img = container.querySelector('img[src="blob:chrome-icon"]');
    expect(img).toBeInTheDocument();
  });

  it('falls back to a plain neutral dot (no per-item color) when no icon resolves', () => {
    const { container } = render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    expect(container.querySelector('img')).toBeNull();
    const dot = container.querySelector('[class*="dot"]');
    expect(dot).toBeInTheDocument();
    expect(dot).not.toHaveAttribute('style');
  });

  it('renders the row sparkline in the accent color only (no per-item color prop)', () => {
    const { container } = render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    const fillPath = container.querySelector('[class*="sparkline"] path[fill]');
    expect(fillPath).toHaveAttribute('fill', 'var(--accent)');
  });

  it('renders the row sparkline as a fill-only silhouette (no stroke line)', () => {
    const { container } = render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    const sparkline = container.querySelector('[class*="sparkline"]');
    expect(sparkline?.querySelector('path[fill]')).not.toBeNull();
    expect(sparkline?.querySelector('path[stroke]')).toBeNull();
  });

  it('filters rows live by name via the search input', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'chr' } });
    expect(screen.getByText('Chrome')).toBeInTheDocument();
    expect(screen.queryByText('AcmeApp')).toBeNull();
    expect(screen.queryByText('Nexus')).toBeNull();
  });

  it('search is case-insensitive', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'NEXUS' } });
    expect(screen.getByText('Nexus')).toBeInTheDocument();
  });

  it('also matches the publisher/company name, not just the process name', () => {
    const withPublishers: ProcessListItem[] = [
      { name: 'chrome.exe', current: 12, values: [], publisher: 'Google LLC' },
      { name: 'Code.exe', current: 4, values: [], publisher: 'Microsoft Corporation' },
      { name: 'Nexus', current: 3, values: [], publisher: null },
    ];
    render(<ProcessListSection items={withPublishers} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'google' } });
    expect(screen.getByText('chrome.exe')).toBeInTheDocument();
    expect(screen.queryByText('Code.exe')).toBeNull();
    expect(screen.queryByText('Nexus')).toBeNull();
  });

  it('does not throw when searching with items that have no publisher at all', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'acme' } });
    expect(screen.getByText('AcmeApp')).toBeInTheDocument();
  });

  it('switches to alphabetical sort via the sort dropdown', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    fireEvent.click(screen.getByRole('button', { name: 'monitoring.history.process.sortAriaLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.history.process.sortName' }));
    const names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['AcmeApp', 'Chrome', 'Nexus']);
  });

  it('shows the current value formatted via formatValue', () => {
    render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    expect(screen.getByText('12%')).toBeInTheDocument();
  });

  it('renders an optional secondary value inline', () => {
    render(<ProcessListSection items={[{ ...items()[0], secondary: '512 MB' }]} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    expect(screen.getByText('512 MB')).toBeInTheDocument();
  });

  it('omits the secondary value when absent', () => {
    const { container } = render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    expect(container.textContent).not.toContain('undefined');
  });

  describe('value column fixed width (no sparkline shift as the value\'s digit count changes)', () => {
    it('reserves no explicit width by default - the column falls back to its own CSS default', () => {
      render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(screen.getByText('12%').style.getPropertyValue('--row-value-min-width')).toBe('');
    });

    it('sets --row-value-min-width from valueMinWidth (the caller\'s active-tab width, e.g. the network/storage byte-rate column)', () => {
      render(
        <ProcessListSection
          items={[items()[0]]}
          formatValue={v => `${v} B/s`}
          onSelectProcess={onSelectProcessMock}
          valueMinWidth="11ch"
        />,
      );
      expect(screen.getByText('12 B/s').style.getPropertyValue('--row-value-min-width')).toBe('11ch');
    });
  });

  it('shows the empty message when no items match', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'zzz' } });
    expect(screen.getByText('monitoring.ranked.empty')).toBeInTheDocument();
  });

  it('shows the empty message for an empty item list', () => {
    render(<ProcessListSection items={[]} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
    expect(screen.getByText('monitoring.ranked.empty')).toBeInTheDocument();
  });

  it('shows no privacy icon for a row with no matching session', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\firefox.exe', capability: 'webcam', start: NOW - 1000, end: null }];
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions })} />);
    expect(screen.queryByRole('img', { name: 'monitoring.privacy.capability.webcam' })).toBeNull();
  });

  it('shows an accented privacy icon for an active session', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions })} />);
    const icon = screen.getByRole('img', { name: 'monitoring.privacy.capability.webcam' });
    expect(icon.className).toContain('privacyIconActive');
  });

  it('shows a dimmed privacy icon for a session that ended within the last hour', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'microphone', start: NOW - 20 * 60_000, end: NOW - 10 * 60_000 }];
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions })} />);
    const icon = screen.getByRole('img', { name: 'monitoring.privacy.capability.microphone' });
    expect(icon.className).toContain('privacyIconRecent');
  });

  it('does not show a privacy icon for a session that ended over an hour ago', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 3 * 3_600_000, end: NOW - 2 * 3_600_000 }];
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions })} />);
    expect(screen.queryByRole('img', { name: 'monitoring.privacy.capability.webcam' })).toBeNull();
  });

  it('the tooltip shows "since" for an active session', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions })} />);
    fireEvent.focus(screen.getByRole('img', { name: 'monitoring.privacy.capability.webcam' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('monitoring.privacy.since');
  });

  it('the tooltip shows "until" for a session that already ended', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 20 * 60_000, end: NOW - 10 * 60_000 }];
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions })} />);
    fireEvent.focus(screen.getByRole('img', { name: 'monitoring.privacy.capability.webcam' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('monitoring.privacy.until');
  });

  it('merges both screen-capture capabilities into one indicator whose tooltip names each session', () => {
    const sessions: PrivacySession[] = [
      { app: 'C:\\chrome.exe', capability: 'graphicsCaptureProgrammatic', start: NOW - 1000, end: null },
      { app: 'C:\\chrome.exe', capability: 'graphicsCaptureWithoutBorder', start: NOW - 2000, end: NOW - 1500 },
    ];
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions })} />);
    expect(screen.getAllByRole('img', { name: 'monitoring.privacy.icon.screen' })).toHaveLength(1);

    fireEvent.focus(screen.getByRole('img', { name: 'monitoring.privacy.icon.screen' }));
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('monitoring.privacy.capability.graphicsCaptureProgrammatic');
    expect(tooltip).toHaveTextContent('monitoring.privacy.capability.graphicsCaptureWithoutBorder');
  });

  it('does not render a privacy icon when the route is unsupported', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions, supported: false })} />);
    expect(screen.queryByRole('img', { name: 'monitoring.privacy.capability.webcam' })).toBeNull();
  });

  it('hides privacy icons while the poll is in an error state instead of freezing stale data', () => {
    const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions, error: true })} />);
    expect(screen.queryByRole('img', { name: 'monitoring.privacy.capability.webcam' })).toBeNull();
  });

  describe('row order stability', () => {
    it('does not reorder rows across a rerender that only changes values', () => {
      const { rerender } = render(
        <ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />,
      );
      let names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
      expect(names).toEqual(['AcmeApp', 'Chrome', 'Nexus']);

      // A totally different usage ranking underneath, but no metric/window
      // change - the visible order must stay exactly as it was.
      const churned: ProcessListItem[] = [
        { name: 'Chrome', current: 99, values: [1] },
        { name: 'AcmeApp', current: 1, values: [1] },
        { name: 'Nexus', current: 50, values: [1] },
      ];
      rerender(<ProcessListSection items={churned} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />);
      names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
      expect(names).toEqual(['AcmeApp', 'Chrome', 'Nexus']);
    });

    it('retains a row missing from a single update instead of dropping it immediately (membership churn)', () => {
      const { rerender } = render(
        <ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />,
      );
      // Nexus drops out of this tick's list entirely (e.g. it fell off a
      // top-N-by-usage feed for one sample) - it must still render.
      const withoutNexus: ProcessListItem[] = [
        { name: 'Chrome', current: 12, values: [1] },
        { name: 'AcmeApp', current: 40, values: [1] },
      ];
      rerender(<ProcessListSection items={withoutNexus} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />);
      expect(screen.getByText('Nexus')).toBeInTheDocument();
    });

    it('re-ranks from scratch when rankResetKey changes (a metric/window switch)', () => {
      const { rerender } = render(
        <ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />,
      );
      const gpuOnly: ProcessListItem[] = [{ name: 'Nexus', current: 5, values: [1] }];
      rerender(<ProcessListSection items={gpuOnly} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} rankResetKey="gpu" />);
      expect(screen.queryByText('Chrome')).toBeNull();
      expect(screen.queryByText('AcmeApp')).toBeNull();
      expect(screen.getByText('Nexus')).toBeInTheDocument();
    });
  });

  describe('Apps/Background processes grouping (round 5 item 5)', () => {
    function groupedItems(): ProcessListItem[] {
      return [
        { name: 'AcmeApp', current: 40, values: [1], isApp: true },
        { name: 'Chrome', current: 12, values: [1], isApp: true },
        { name: 'svchost.exe', current: 3, values: [1], isApp: false },
        { name: 'Nexus', current: 3, values: [1] }, // no isApp - treated as background
      ];
    }

    it('shows both group headers, apps above background, each with its own rows', () => {
      const { container } = render(<ProcessListSection items={groupedItems()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      const headers = [...container.querySelectorAll('[class*="groupHeader"]')].map(h => h.textContent);
      expect(headers).toEqual(['monitoring.history.process.group.apps', 'monitoring.history.process.group.background']);

      const rows = container.querySelectorAll('[class*="row"]:not([class*="rows"])');
      expect(rows.length).toBe(4);
    });

    it('treats a missing isApp as background - graceful until the field ships everywhere', () => {
      render(<ProcessListSection items={groupedItems()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      const background = screen.getByText('monitoring.history.process.group.background');
      // Nexus (no isApp) and svchost.exe (isApp:false) both land after the
      // background header, not the apps one.
      expect(background.compareDocumentPosition(screen.getByText('Nexus')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(background.compareDocumentPosition(screen.getByText('svchost.exe')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('hides the Apps header entirely when nothing is currently classified as an app', () => {
      const allBackground: ProcessListItem[] = [{ name: 'svchost.exe', current: 3, values: [1], isApp: false }];
      render(<ProcessListSection items={allBackground} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(screen.queryByText('monitoring.history.process.group.apps')).toBeNull();
      expect(screen.getByText('monitoring.history.process.group.background')).toBeInTheDocument();
    });

    it('hides the Background header entirely when every row is an app', () => {
      const allApps: ProcessListItem[] = [{ name: 'Chrome', current: 12, values: [1], isApp: true }];
      render(<ProcessListSection items={allApps} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(screen.getByText('monitoring.history.process.group.apps')).toBeInTheDocument();
      expect(screen.queryByText('monitoring.history.process.group.background')).toBeNull();
    });

    it('search filters across both groups', () => {
      render(<ProcessListSection items={groupedItems()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'chrome' } });
      expect(screen.getByText('Chrome')).toBeInTheDocument();
      expect(screen.queryByText('AcmeApp')).toBeNull();
      expect(screen.queryByText('svchost.exe')).toBeNull();
      expect(screen.queryByText('Nexus')).toBeNull();
    });

    it('preserves the frozen stable order within each group across many ticks of pure value churn (round 5 acceptance test)', () => {
      const { rerender } = render(
        <ProcessListSection items={groupedItems()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />,
      );
      const appNames = screen.getAllByText(/AcmeApp|Chrome/).map(el => el.textContent);
      const backgroundNames = screen.getAllByText(/svchost\.exe|Nexus/).map(el => el.textContent);

      for (let tick = 0; tick < 15; tick++) {
        const churned = groupedItems().map(i => ({ ...i, current: Math.random() * 100 }));
        rerender(<ProcessListSection items={churned} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />);
        expect(screen.getAllByText(/AcmeApp|Chrome/).map(el => el.textContent)).toEqual(appNames);
        expect(screen.getAllByText(/svchost\.exe|Nexus/).map(el => el.textContent)).toEqual(backgroundNames);
      }
    });
  });

  describe('publisher + Unsigned badge (round 5 item 6)', () => {
    it('renders the publisher dimmed after the process name', () => {
      const withPublisher: ProcessListItem[] = [{ name: 'Chrome', current: 12, values: [1], publisher: 'Google LLC' }];
      const { container } = render(<ProcessListSection items={withPublisher} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      const publisher = container.querySelector('[class*="publisher"]');
      expect(publisher).toHaveTextContent('Google LLC');
    });

    it('groups the name and publisher together (not pushed apart by the row\'s own flexible slot)', () => {
      const withPublisher: ProcessListItem[] = [{ name: 'Chrome', current: 12, values: [1], publisher: 'Google LLC', signed: 'unsigned' }];
      const { container } = render(<ProcessListSection items={withPublisher} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      const nameGroup = container.querySelector('[class*="nameGroup"]')!;
      expect(nameGroup).not.toBeNull();
      // Name, publisher, and the Unsigned badge all sit inside the same
      // packed group - only that group (not .name itself) carries the row's
      // flexible slot, so the publisher hugs the name instead of landing at
      // wherever a flex:1 .name box happens to end.
      expect(nameGroup.querySelector('[class*="name"]')).not.toBeNull();
      expect(nameGroup.querySelector('[class*="publisher"]')).not.toBeNull();
      expect(nameGroup).toHaveTextContent('monitoring.processDetail.info.unsigned');
    });

    it('renders no publisher text when publisher is null or absent', () => {
      const noPublisher: ProcessListItem[] = [{ name: 'Chrome', current: 12, values: [1], publisher: null }];
      const { container } = render(<ProcessListSection items={noPublisher} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(container.querySelector('[class*="publisher"]')).toBeNull();
    });

    it('shows the Unsigned badge when signed is "unsigned"', () => {
      const unsigned: ProcessListItem[] = [{ name: 'sketchy-tool.exe', current: 3, values: [1], signed: 'unsigned' }];
      render(<ProcessListSection items={unsigned} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(screen.getByText('monitoring.processDetail.info.unsigned')).toBeInTheDocument();
    });

    it('shows no badge when signed is "unknown" or absent', () => {
      const items2: ProcessListItem[] = [{ name: 'Chrome', current: 12, values: [1], signed: 'unknown' }];
      render(<ProcessListSection items={items2} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(screen.queryByText('monitoring.processDetail.info.unsigned')).toBeNull();
    });

    it('shows no badge when signed is "signed"', () => {
      const items2: ProcessListItem[] = [{ name: 'Chrome', current: 12, values: [1], signed: 'signed' }];
      render(<ProcessListSection items={items2} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(screen.queryByText('monitoring.processDetail.info.unsigned')).toBeNull();
    });
  });

  describe('frozen fallback snapshot (item 33)', () => {
    it('shows no frozen notice or dimming by default', () => {
      const { container } = render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(container.querySelector('[class*="frozenNotice"]')).toBeNull();
      expect(container.querySelector('[class*="rowsFrozen"]')).toBeNull();
    });

    it('shows the frozen disclosure and dims the rows when frozen', () => {
      const { container } = render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} frozen />);
      expect(screen.getByText('monitoring.history.process.frozenNotice')).toBeInTheDocument();
      expect(container.querySelector('[class*="rowsFrozen"]')).toBeInTheDocument();
      // The rows themselves still render normally - only dimmed via CSS.
      expect(screen.getByText('Chrome')).toBeInTheDocument();
    });
  });

  describe('point-in-time snapshot affordance', () => {
    it('shows no snapshot badge by default', () => {
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(screen.queryByText('monitoring.history.process.snapshotAt')).toBeNull();
    });

    it('shows the snapshot badge when snapshotAtMs is set, and clears it on the X button', () => {
      const onClearSnapshot = vi.fn();
      render(
        <ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} snapshotAtMs={1_700_000_000_000} onClearSnapshot={onClearSnapshot} />,
      );
      expect(screen.getByText('monitoring.history.process.snapshotAt')).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('monitoring.history.process.clearSnapshot'));
      expect(onClearSnapshot).toHaveBeenCalledTimes(1);
    });

    it('shows no badge when snapshotAtMs is null', () => {
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} snapshotAtMs={null} />);
      expect(screen.queryByText('monitoring.history.process.snapshotAt')).toBeNull();
    });
  });

  describe('performance at scale (item 37: full process list, no client-side cap)', () => {
    function manyItems(n: number): ProcessListItem[] {
      return Array.from({ length: n }, (_, i) => ({
        name: `proc-${i}.exe`,
        current: Math.random() * 100,
        values: Array.from({ length: 30 }, () => Math.random() * 100),
      }));
    }

    it('renders every row with no truncation at 300 entries (search/scroll handle length, not a hard cap)', () => {
      const { container } = render(<ProcessListSection items={manyItems(300)} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(container.querySelectorAll('[class*="row"]:not([class*="rows"])').length).toBe(300);
    });

    // Generous enough to never flake under contention (measured locally
    // under jsdom at ~110ms for the initial mount, ~60ms for an
    // all-new-values re-render; this workspace routinely runs several
    // concurrent agent sessions on one machine - see
    // .agents/rules/failure-log.md) while still catching a real regression
    // (an accidental unmemoized full-tree recompute, a stray O(n^2) pass).
    const BUDGET_MS = 2000;

    it('mounts 300 rows within budget', () => {
      const start = performance.now();
      render(<ProcessListSection items={manyItems(300)} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(performance.now() - start).toBeLessThan(BUDGET_MS);
    });

    it('re-renders 300 rows with all-new values (a simulated live tick) within budget', () => {
      const initial = manyItems(300);
      const { rerender } = render(<ProcessListSection items={initial} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      const churned = manyItems(300).map((it, i) => ({ ...it, name: initial[i].name }));

      const start = performance.now();
      rerender(<ProcessListSection items={churned} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(performance.now() - start).toBeLessThan(BUDGET_MS);
    });
  });

  describe('repeated 1Hz-tick re-render through the real reconciliation pipeline (item R4-53)', () => {
    // The live process list is rebuilt through reconcileLiveWithWindow on
    // every monitoring frame (see MonitoringPage's liveItems/processItems),
    // not a plain prop swap - this exercises that same shape (a top-15
    // window-scoped subset unioned onto a 300-row live list) across several
    // simulated ticks, not a single rerender.
    function baselineItems(n: number): ProcessListItem[] {
      return Array.from({ length: n }, (_, i) => ({
        name: `proc-${i}.exe`,
        current: Math.random() * 100,
        values: Array.from({ length: 60 }, () => Math.random() * 100),
      }));
    }

    function windowAppsFor(names: string[]): AppWindowSeries[] {
      return names.map(name => ({
        name,
        avg: Math.random() * 100,
        max: 100,
        points: Array.from({ length: 30 }, (_, i) => ({ t: i * 1000, avg: Math.random() * 100 })),
      }));
    }

    const TICKS = 15;
    // Measured locally under jsdom: ~30ms/tick even when every one of 300
    // rows changes every tick (the worst case - no real machine has every
    // process's usage move every second). Generous for the same contention
    // reasons as BUDGET_MS above.
    const PER_TICK_BUDGET_MS = 400;

    // MonitoringPage.tsx's own formatValue is useMemo-stabilized (keyed on
    // [tab, numberFormat]) - a fresh arrow function here would defeat
    // ProcessRow's memo comparator on that prop alone regardless of whether
    // a row's own data changed, silently making every test below measure
    // "no memoization" instead of the real app's behavior.
    const formatValue = (v: number) => `${v}%`;

    it('stays within budget across repeated ticks where every row changes (worst case)', () => {
      const baseline = baselineItems(300);
      const windowApps = windowAppsFor(baseline.slice(0, 15).map(i => i.name));
      const first = reconcileLiveWithWindow(baseline, windowApps);
      const { rerender } = render(<ProcessListSection items={first} formatValue={formatValue} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />);

      const start = performance.now();
      for (let tick = 0; tick < TICKS; tick++) {
        const live = baselineItems(300).map((item, i) => ({ ...item, name: baseline[i].name }));
        rerender(<ProcessListSection items={reconcileLiveWithWindow(live, windowApps)} formatValue={formatValue} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />);
      }
      const perTick = (performance.now() - start) / TICKS;
      expect(perTick).toBeLessThan(PER_TICK_BUDGET_MS);
    });

    it('stays within budget across repeated ticks where most rows are near-idle (realistic case)', () => {
      const baseline = baselineItems(300);
      const windowApps = windowAppsFor(baseline.slice(0, 15).map(i => i.name));
      const first = reconcileLiveWithWindow(baseline, windowApps);
      const { rerender } = render(<ProcessListSection items={first} formatValue={formatValue} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />);

      const ACTIVE_COUNT = 20;
      const start = performance.now();
      for (let tick = 0; tick < TICKS; tick++) {
        const live = baseline.map((item, i) => (i < ACTIVE_COUNT
          ? { ...item, current: Math.random() * 100, values: Array.from({ length: 60 }, () => Math.random() * 100) }
          : item));
        rerender(<ProcessListSection items={reconcileLiveWithWindow(live, windowApps)} formatValue={formatValue} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />);
      }
      const perTick = (performance.now() - start) / TICKS;
      expect(perTick).toBeLessThan(PER_TICK_BUDGET_MS);
    });

    it('re-renders only the rows whose own data actually changed (direct memo verification, not a timing inference)', () => {
      const baseline = baselineItems(300);
      const windowApps = windowAppsFor(baseline.slice(0, 15).map(i => i.name));
      const first = reconcileLiveWithWindow(baseline, windowApps);
      const { rerender } = render(<ProcessListSection items={first} formatValue={formatValue} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />);

      const ACTIVE_COUNT = 20;
      const live = baseline.map((item, i) => (i < ACTIVE_COUNT
        ? { ...item, current: Math.random() * 100, values: Array.from({ length: 60 }, () => Math.random() * 100) }
        : item));

      sparklineRenderCount = 0;
      rerender(<ProcessListSection items={reconcileLiveWithWindow(live, windowApps)} formatValue={formatValue} onSelectProcess={onSelectProcessMock} rankResetKey="cpu" />);

      // Only the changed rows (up to ACTIVE_COUNT, plus whichever of the 15
      // window-matched names happen to have moved) re-render their
      // Sparkline - not all 300, proving ProcessRow's memo actually skips
      // untouched rows rather than merely being present but inert.
      expect(sparklineRenderCount).toBeGreaterThan(0);
      expect(sparklineRenderCount).toBeLessThan(300);
    });
  });

  describe('icon slot indentation (item 44)', () => {
    it('wraps a loaded icon in the same reserved slot structure as the dot fallback', () => {
      processIconMock.mockImplementation(name => (name === 'Chrome' ? 'blob:chrome-icon' : null));
      const { container } = render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);

      const rows = container.querySelectorAll('[class*="row"]:not([class*="rows"])');
      // Every row's first child is the icon slot, whether it resolved (img)
      // or not (dot) - same wrapper class, same position ahead of the name.
      rows.forEach(row => {
        const slot = row.firstElementChild;
        expect(slot).not.toBeNull();
        expect(slot!.className).toContain('iconSlot');
      });

      // The name now sits inside .nameGroup (alongside publisher/Unsigned
      // badge) - the icon slot is that group's own previous sibling, not
      // the name span's directly.
      const loadedSlot = screen.getByText('Chrome').closest('[class*="nameGroup"]')!.previousElementSibling;
      const pendingSlot = screen.getByText('Nexus').closest('[class*="nameGroup"]')!.previousElementSibling;
      expect(loadedSlot!.className).toBe(pendingSlot!.className);
      expect(loadedSlot!.querySelector('img')).not.toBeNull();
      expect(pendingSlot!.querySelector('img')).toBeNull();
      expect(pendingSlot!.querySelector('[class*="dot"]')).not.toBeNull();
    });
  });

  describe('row selection reporting (item 45 - MonitoringPage owns the panel)', () => {
    it('reports the clicked row\'s name via onSelectProcess', () => {
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      fireEvent.click(screen.getByText('Chrome'));
      expect(onSelectProcessMock).toHaveBeenCalledWith('Chrome');
    });

    it('reports the row via Enter on a focused row (keyboard activation)', () => {
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      // Every row shares the same aria-label text in this provider-less test
      // environment (t() here returns the bare key, unfilled - see the
      // sibling tests above asserting on raw keys like
      // 'monitoring.privacy.capability.webcam'), so pick one row rather than
      // asserting on a specific name.
      const [firstRow] = screen.getAllByRole('button', { name: 'monitoring.history.process.openDetails' });
      fireEvent.keyDown(firstRow, { key: 'Enter' });
      expect(onSelectProcessMock).toHaveBeenCalledTimes(1);
    });

    it('does not report a selection when Enter bubbles up from a nested focusable privacy icon', () => {
      const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions })} />);

      const icon = screen.getByRole('img', { name: 'monitoring.privacy.capability.webcam' });
      fireEvent.keyDown(icon, { key: 'Enter', bubbles: true });
      expect(onSelectProcessMock).not.toHaveBeenCalled();
    });

    it('reports each row independently as different rows are clicked', () => {
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      fireEvent.click(screen.getByText('Chrome'));
      fireEvent.click(screen.getByText('Nexus'));
      expect(onSelectProcessMock.mock.calls.map(c => c[0])).toEqual(['Chrome', 'Nexus']);
    });

    it('does not fight the privacy icon\'s own hover tooltip - clicking the row still renders the tooltip content on focus', () => {
      const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} {...privacyProps({ sessions })} />);

      const icon = screen.getByRole('img', { name: 'monitoring.privacy.capability.webcam' });
      fireEvent.focus(icon);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
  });

  describe('selected row highlight (MonitoringPage owns selectedProcess)', () => {
    it('marks only the row matching selectedProcessName as active, and no row when nothing is selected', () => {
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} selectedProcessName="Chrome" />);
      const chromeRow = screen.getByText('Chrome').closest('[role="button"]')!;
      const acmeRow = screen.getByText('AcmeApp').closest('[role="button"]')!;
      expect(chromeRow.className).toContain('rowSelected');
      expect(chromeRow).toHaveAttribute('aria-current', 'true');
      expect(acmeRow.className).not.toContain('rowSelected');
      expect(acmeRow).not.toHaveAttribute('aria-current');
    });

    it('highlights no row when selectedProcessName is omitted', () => {
      const { container } = render(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} />);
      expect(container.querySelector('[class*="rowSelected"]')).toBeNull();
    });

    it('clears the highlight once selectedProcessName is cleared', () => {
      const { rerender } = render(
        <ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} selectedProcessName="Chrome" />,
      );
      expect(screen.getByText('Chrome').closest('[role="button"]')!.className).toContain('rowSelected');

      rerender(<ProcessListSection items={items()} formatValue={v => `${v}%`} onSelectProcess={onSelectProcessMock} selectedProcessName={null} />);
      expect(screen.getByText('Chrome').closest('[role="button"]')!.className).not.toContain('rowSelected');
    });
  });
});

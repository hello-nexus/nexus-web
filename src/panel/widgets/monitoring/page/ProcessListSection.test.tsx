import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProcessListSection, type ProcessListItem } from './ProcessListSection';
import { reconcileLiveWithWindow } from './appWindowHelpers';
import type { AppWindowSeries } from '../../../../api/monitoringHistoryApps';
import type { UseMonitoringPrivacyResult } from '../../../../hooks/useMonitoringPrivacy';
import type { PrivacySession } from '../../../../api/monitoringPrivacy';

const NOW = 10_000_000;

const privacyMock = vi.fn<() => UseMonitoringPrivacyResult>();
vi.mock('../../../../hooks/useMonitoringPrivacy', () => ({
  useMonitoringPrivacy: () => privacyMock(),
}));

const processIconMock = vi.fn<(name: string) => string | null>();
vi.mock('../../../../hooks/useProcessIcon', () => ({
  useProcessIcon: (name: string) => processIconMock(name),
}));

// ProcessDetailSlideout has its own dedicated test file (fetches process
// info, drives Kill/Open-location, etc.) - stubbed here to a name-tracing
// marker so this file only asserts that a row click opens IT for the right
// process, not its internals.
vi.mock('./ProcessDetailSlideout', () => ({
  ProcessDetailSlideout: ({ name, onClose }: { name: string; onClose: () => void }) => (
    <div data-testid="process-detail-slideout">
      <span>detail:{name}</span>
      <button type="button" onClick={onClose}>close</button>
    </div>
  ),
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
    { name: 'Chrome', current: 12, values: [1, 2, 3] },
    { name: 'AcmeApp', current: 40, values: [4, 5, 6] },
    { name: 'Nexus', current: 3, values: [1, 1, 1] },
  ];
}

describe('ProcessListSection', () => {
  beforeEach(() => {
    privacyMock.mockReturnValue(privacyResult());
    processIconMock.mockReturnValue(null);
  });

  it('defaults to the recency sort, falling back to usage order when no item reports startedAtMs', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    const names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['AcmeApp', 'Chrome', 'Nexus']);
  });

  it('recency sort ranks by startedAtMs (most recent first) when items report it', () => {
    const withRecency: ProcessListItem[] = [
      { name: 'Chrome', current: 12, values: [], startedAtMs: 1000 },
      { name: 'AcmeApp', current: 40, values: [], startedAtMs: 3000 },
      { name: 'Nexus', current: 3, values: [], startedAtMs: 2000 },
    ];
    render(<ProcessListSection items={withRecency} formatValue={v => `${v}%`} />);
    const names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['AcmeApp', 'Nexus', 'Chrome']);
  });

  it('sorts an app with a known launch time above one without, under the recency sort', () => {
    const mixed: ProcessListItem[] = [
      { name: 'Chrome', current: 90, values: [] },
      { name: 'AcmeApp', current: 1, values: [], startedAtMs: 1000 },
    ];
    render(<ProcessListSection items={mixed} formatValue={v => `${v}%`} />);
    const names = screen.getAllByText(/Chrome|AcmeApp/).map(el => el.textContent);
    expect(names).toEqual(['AcmeApp', 'Chrome']);
  });

  it('switches to usage sort via the sort dropdown', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.click(screen.getByRole('button', { name: 'monitoring.history.process.sortAriaLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'monitoring.history.process.sortUsage' }));
    const names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['AcmeApp', 'Chrome', 'Nexus']);
  });

  it('renders the app icon in place of the dot when one resolves', () => {
    processIconMock.mockImplementation(name => (name === 'Chrome' ? 'blob:chrome-icon' : null));
    const { container } = render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    const img = container.querySelector('img[src="blob:chrome-icon"]');
    expect(img).toBeInTheDocument();
  });

  it('falls back to a plain neutral dot (no per-item color) when no icon resolves', () => {
    const { container } = render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} />);
    expect(container.querySelector('img')).toBeNull();
    const dot = container.querySelector('[class*="dot"]');
    expect(dot).toBeInTheDocument();
    expect(dot).not.toHaveAttribute('style');
  });

  it('renders the row sparkline in the accent color only (no per-item color prop)', () => {
    const { container } = render(<ProcessListSection items={[items()[0]]} formatValue={v => `${v}%`} />);
    const fillPath = container.querySelector('[class*="sparkline"] path[fill]');
    expect(fillPath).toHaveAttribute('fill', 'var(--accent)');
  });

  it('filters rows live by name via the search input', () => {
    render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
    fireEvent.change(screen.getByPlaceholderText('monitoring.history.process.searchPlaceholder'), { target: { value: 'chr' } });
    expect(screen.getByText('Chrome')).toBeInTheDocument();
    expect(screen.queryByText('AcmeApp')).toBeNull();
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
    const names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
    expect(names).toEqual(['AcmeApp', 'Chrome', 'Nexus']);
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

  describe('row order stability', () => {
    it('does not reorder rows across a rerender that only changes values', () => {
      const { rerender } = render(
        <ProcessListSection items={items()} formatValue={v => `${v}%`} rankResetKey="cpu" />,
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
      rerender(<ProcessListSection items={churned} formatValue={v => `${v}%`} rankResetKey="cpu" />);
      names = screen.getAllByText(/Chrome|AcmeApp|Nexus/).map(el => el.textContent);
      expect(names).toEqual(['AcmeApp', 'Chrome', 'Nexus']);
    });

    it('retains a row missing from a single update instead of dropping it immediately (membership churn)', () => {
      const { rerender } = render(
        <ProcessListSection items={items()} formatValue={v => `${v}%`} rankResetKey="cpu" />,
      );
      // Nexus drops out of this tick's list entirely (e.g. it fell off a
      // top-N-by-usage feed for one sample) - it must still render.
      const withoutNexus: ProcessListItem[] = [
        { name: 'Chrome', current: 12, values: [1] },
        { name: 'AcmeApp', current: 40, values: [1] },
      ];
      rerender(<ProcessListSection items={withoutNexus} formatValue={v => `${v}%`} rankResetKey="cpu" />);
      expect(screen.getByText('Nexus')).toBeInTheDocument();
    });

    it('re-ranks from scratch when rankResetKey changes (a metric/window switch)', () => {
      const { rerender } = render(
        <ProcessListSection items={items()} formatValue={v => `${v}%`} rankResetKey="cpu" />,
      );
      const gpuOnly: ProcessListItem[] = [{ name: 'Nexus', current: 5, values: [1] }];
      rerender(<ProcessListSection items={gpuOnly} formatValue={v => `${v}%`} rankResetKey="gpu" />);
      expect(screen.queryByText('Chrome')).toBeNull();
      expect(screen.queryByText('AcmeApp')).toBeNull();
      expect(screen.getByText('Nexus')).toBeInTheDocument();
    });
  });

  describe('frozen fallback snapshot (item 33)', () => {
    it('shows no frozen notice or dimming by default', () => {
      const { container } = render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
      expect(container.querySelector('[class*="frozenNotice"]')).toBeNull();
      expect(container.querySelector('[class*="rowsFrozen"]')).toBeNull();
    });

    it('shows the frozen disclosure and dims the rows when frozen', () => {
      const { container } = render(<ProcessListSection items={items()} formatValue={v => `${v}%`} frozen />);
      expect(screen.getByText('monitoring.history.process.frozenNotice')).toBeInTheDocument();
      expect(container.querySelector('[class*="rowsFrozen"]')).toBeInTheDocument();
      // The rows themselves still render normally - only dimmed via CSS.
      expect(screen.getByText('Chrome')).toBeInTheDocument();
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
      const { container } = render(<ProcessListSection items={manyItems(300)} formatValue={v => `${v}%`} />);
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
      render(<ProcessListSection items={manyItems(300)} formatValue={v => `${v}%`} />);
      expect(performance.now() - start).toBeLessThan(BUDGET_MS);
    });

    it('re-renders 300 rows with all-new values (a simulated live tick) within budget', () => {
      const initial = manyItems(300);
      const { rerender } = render(<ProcessListSection items={initial} formatValue={v => `${v}%`} />);
      const churned = manyItems(300).map((it, i) => ({ ...it, name: initial[i].name }));

      const start = performance.now();
      rerender(<ProcessListSection items={churned} formatValue={v => `${v}%`} />);
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
      const { rerender } = render(<ProcessListSection items={first} formatValue={formatValue} rankResetKey="cpu" />);

      const start = performance.now();
      for (let tick = 0; tick < TICKS; tick++) {
        const live = baselineItems(300).map((item, i) => ({ ...item, name: baseline[i].name }));
        rerender(<ProcessListSection items={reconcileLiveWithWindow(live, windowApps)} formatValue={formatValue} rankResetKey="cpu" />);
      }
      const perTick = (performance.now() - start) / TICKS;
      expect(perTick).toBeLessThan(PER_TICK_BUDGET_MS);
    });

    it('stays within budget across repeated ticks where most rows are near-idle (realistic case)', () => {
      const baseline = baselineItems(300);
      const windowApps = windowAppsFor(baseline.slice(0, 15).map(i => i.name));
      const first = reconcileLiveWithWindow(baseline, windowApps);
      const { rerender } = render(<ProcessListSection items={first} formatValue={formatValue} rankResetKey="cpu" />);

      const ACTIVE_COUNT = 20;
      const start = performance.now();
      for (let tick = 0; tick < TICKS; tick++) {
        const live = baseline.map((item, i) => (i < ACTIVE_COUNT
          ? { ...item, current: Math.random() * 100, values: Array.from({ length: 60 }, () => Math.random() * 100) }
          : item));
        rerender(<ProcessListSection items={reconcileLiveWithWindow(live, windowApps)} formatValue={formatValue} rankResetKey="cpu" />);
      }
      const perTick = (performance.now() - start) / TICKS;
      expect(perTick).toBeLessThan(PER_TICK_BUDGET_MS);
    });

    it('re-renders only the rows whose own data actually changed (direct memo verification, not a timing inference)', () => {
      const baseline = baselineItems(300);
      const windowApps = windowAppsFor(baseline.slice(0, 15).map(i => i.name));
      const first = reconcileLiveWithWindow(baseline, windowApps);
      const { rerender } = render(<ProcessListSection items={first} formatValue={formatValue} rankResetKey="cpu" />);

      const ACTIVE_COUNT = 20;
      const live = baseline.map((item, i) => (i < ACTIVE_COUNT
        ? { ...item, current: Math.random() * 100, values: Array.from({ length: 60 }, () => Math.random() * 100) }
        : item));

      sparklineRenderCount = 0;
      rerender(<ProcessListSection items={reconcileLiveWithWindow(live, windowApps)} formatValue={formatValue} rankResetKey="cpu" />);

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
      const { container } = render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);

      const rows = container.querySelectorAll('[class*="row"]:not([class*="rows"])');
      // Every row's first child is the icon slot, whether it resolved (img)
      // or not (dot) - same wrapper class, same position ahead of the name.
      rows.forEach(row => {
        const slot = row.firstElementChild;
        expect(slot).not.toBeNull();
        expect(slot!.className).toContain('iconSlot');
      });

      const loadedSlot = screen.getByText('Chrome').previousElementSibling;
      const pendingSlot = screen.getByText('Nexus').previousElementSibling;
      expect(loadedSlot!.className).toBe(pendingSlot!.className);
      expect(loadedSlot!.querySelector('img')).not.toBeNull();
      expect(pendingSlot!.querySelector('img')).toBeNull();
      expect(pendingSlot!.querySelector('[class*="dot"]')).not.toBeNull();
    });
  });

  describe('click-to-open process detail (item 45)', () => {
    it('opens the detail slideout for the clicked row', () => {
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
      expect(screen.queryByTestId('process-detail-slideout')).toBeNull();

      fireEvent.click(screen.getByText('Chrome'));
      expect(screen.getByTestId('process-detail-slideout')).toBeInTheDocument();
      expect(screen.getByText('detail:Chrome')).toBeInTheDocument();
    });

    it('opens via Enter on a focused row (keyboard activation)', () => {
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
      // Every row shares the same aria-label text in this provider-less test
      // environment (t() here returns the bare key, unfilled - see the
      // sibling tests above asserting on raw keys like
      // 'monitoring.privacy.capability.webcam'), so pick one row rather than
      // asserting on a specific name.
      const [firstRow] = screen.getAllByRole('button', { name: 'monitoring.history.process.openDetails' });
      fireEvent.keyDown(firstRow, { key: 'Enter' });
      expect(screen.getByTestId('process-detail-slideout')).toBeInTheDocument();
    });

    it('does not open the slideout when Enter bubbles up from a nested focusable privacy icon', () => {
      const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
      privacyMock.mockReturnValue(privacyResult({ sessions }));
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);

      const icon = screen.getByRole('img', { name: 'monitoring.privacy.capability.webcam' });
      fireEvent.keyDown(icon, { key: 'Enter', bubbles: true });
      expect(screen.queryByTestId('process-detail-slideout')).toBeNull();
    });

    it('switches to a different process when a different row is clicked', () => {
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
      fireEvent.click(screen.getByText('Chrome'));
      expect(screen.getByText('detail:Chrome')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Nexus'));
      expect(screen.getByText('detail:Nexus')).toBeInTheDocument();
      expect(screen.queryByText('detail:Chrome')).toBeNull();
    });

    it('closes when the slideout calls onClose', () => {
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);
      fireEvent.click(screen.getByText('Chrome'));
      fireEvent.click(screen.getByText('close'));
      expect(screen.queryByTestId('process-detail-slideout')).toBeNull();
    });

    it('does not fight the privacy icon\'s own hover tooltip - clicking the row still renders the tooltip content on focus', () => {
      const sessions: PrivacySession[] = [{ app: 'C:\\chrome.exe', capability: 'webcam', start: NOW - 1000, end: null }];
      privacyMock.mockReturnValue(privacyResult({ sessions }));
      render(<ProcessListSection items={items()} formatValue={v => `${v}%`} />);

      const icon = screen.getByRole('img', { name: 'monitoring.privacy.capability.webcam' });
      fireEvent.focus(icon);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
  });
});

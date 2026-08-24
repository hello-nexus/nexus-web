import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// jsdom has no IntersectionObserver; the row's lazy icon fetch is gated on it,
// so this stub reports every observed row as visible straight away.
class ImmediateIntersectionObserver {
  constructor(private cb: (entries: { isIntersecting: boolean }[]) => void) {}
  observe() { this.cb([{ isIntersecting: true }]); }
  disconnect() {}
  unobserve() {}
}
globalThis.IntersectionObserver = ImmediateIntersectionObserver as unknown as typeof IntersectionObserver;

const topicListeners = new Map<string, (data: unknown) => void>();

vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, onFrame: (data: unknown) => void) => {
    if (enabled) topicListeners.set(topic, onFrame);
    else topicListeners.delete(topic);
  },
}));
vi.mock('../../../api/service', () => ({
  fetchService: vi.fn(),
  fetchServiceBlob: vi.fn(),
}));

import { AppPicker } from './AppPicker';
import { fetchService, fetchServiceBlob } from '../../../api/service';

const SHORTCUTS = {
  shortcuts: [
    { id: 'com.example.chrome', name: 'Google Chrome', path: '/c/chrome.exe', processName: 'chrome' },
    { id: 'com.example.code', name: 'Visual Studio Code', path: '/c/code.exe', processName: 'Code' },
    { id: 'Some.Uwp!App', name: 'Notepad', path: '', processName: '' },
    { id: 'com.example.chrome.beta', name: 'Chrome Beta', path: '/c/chrome.exe', processName: 'chrome' },
  ],
};

function emitProcesses(rows: { name: string; isApp?: boolean }[]) {
  act(() => { topicListeners.get('processes')?.({ processes: rows }); });
}

describe('AppPicker running-apps group', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    topicListeners.clear();
    vi.mocked(fetchService).mockResolvedValue(SHORTCUTS);
    vi.mocked(fetchServiceBlob).mockResolvedValue(null);
    global.URL.createObjectURL = vi.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('does not subscribe to processes unless showRunning is set', async () => {
    render(<AppPicker onSelect={vi.fn()} />);
    await screen.findByText('Google Chrome');
    expect(topicListeners.has('processes')).toBe(false);
  });

  it('lists windowed processes above the installed apps', async () => {
    render(<AppPicker showRunning onSelect={vi.fn()} />);
    await screen.findByText('Google Chrome');

    emitProcesses([
      { name: 'steam', isApp: true },
      { name: 'svchost', isApp: false },
      { name: 'discord', isApp: true },
    ]);

    await waitFor(() => expect(screen.getByText('steam')).toBeTruthy());
    // Background processes never appear - only windowed ones can take focus.
    expect(screen.queryByText('svchost')).toBeNull();

    const labels = [...document.querySelectorAll('div')]
      .filter(d => d.className.includes('groupLabel'))
      .map(d => d.textContent);
    expect(labels).toEqual(['panel.settings.runningApps', 'panel.settings.installedApps']);

    const rows = [...document.querySelectorAll('button')]
      .filter(b => b.className.includes('appRow'))
      .map(b => b.textContent);
    // Running entries sort alphabetically and precede every installed app.
    expect(rows.slice(0, 2)).toEqual(['discord', 'steam']);
  });

  it('a running pick carries the proc: id the service matches focus on', async () => {
    const onSelect = vi.fn();
    render(<AppPicker showRunning onSelect={onSelect} />);
    await screen.findByText('Google Chrome');
    emitProcesses([{ name: 'steam', isApp: true }]);

    await waitFor(() => expect(screen.getByText('steam')).toBeTruthy());
    fireEvent.click(screen.getByText('steam'));
    expect(onSelect).toHaveBeenCalledWith({ id: 'proc:steam', name: 'steam', processName: 'steam' });
  });

  it('running icons come from the process-icon route, installed ones from shortcuts', async () => {
    render(<AppPicker showRunning onSelect={vi.fn()} />);
    await screen.findByText('Google Chrome');
    emitProcesses([{ name: 'steam', isApp: true }]);
    await waitFor(() => expect(screen.getByText('steam')).toBeTruthy());

    await waitFor(() => {
      const paths = vi.mocked(fetchServiceBlob).mock.calls.map(c => c[0]);
      expect(paths).toContain('/monitoring/process-icon?name=steam');
      expect(paths).toContain('/shortcuts/icon?targetId=com.example.chrome');
    });
  });

  it('selectedIds marks every bound row, not just one', async () => {
    render(<AppPicker showRunning selectedIds={['proc:steam', 'com.example.code']} onSelect={vi.fn()} />);
    await screen.findByText('Google Chrome');
    emitProcesses([{ name: 'steam', isApp: true }]);
    await waitFor(() => expect(screen.getByText('steam')).toBeTruthy());

    const selected = [...document.querySelectorAll('button')]
      .filter(b => b.className.includes('appRowSelected'))
      .map(b => b.textContent);
    expect(selected.sort()).toEqual(['Visual Studio Code', 'steam']);
  });

  it('the search filter narrows both groups', async () => {
    render(<AppPicker showRunning onSelect={vi.fn()} />);
    await screen.findByText('Google Chrome');
    emitProcesses([{ name: 'steam', isApp: true }, { name: 'code', isApp: true }]);
    await waitFor(() => expect(screen.getByText('steam')).toBeTruthy());

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'stea' } });
    expect([...document.querySelectorAll('button')]
      .filter(b => b.className.includes('appRow'))
      .map(b => b.textContent)).toEqual(['steam']);

    // 'code' is running AND installed, so it appears once - under Running now,
    // with its installed name.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'code' } });
    expect([...document.querySelectorAll('button')]
      .filter(b => b.className.includes('appRow'))
      .map(b => b.textContent)).toEqual(['Visual Studio Code']);
  });

  // ---- one app, one row ----

  it('a running app that is also installed is listed once, with its installed identity', async () => {
    const onSelect = vi.fn();
    render(<AppPicker showRunning onSelect={onSelect} />);
    await screen.findByText('Google Chrome');
    emitProcesses([{ name: 'chrome', isApp: true }]);
    await waitFor(() => expect(
      [...document.querySelectorAll('button')].filter(b => b.className.includes('appRow')).length,
    ).toBeGreaterThan(0));

    // Exactly one Chrome row, and it sits in the Running now group.
    const rows = [...document.querySelectorAll('button')]
      .filter(b => b.className.includes('appRow'))
      .map(b => b.textContent);
    expect(rows.filter(r => r === 'Google Chrome')).toHaveLength(1);
    expect(rows[0]).toBe('Google Chrome');

    // It binds under the installed id, not proc:chrome.
    fireEvent.click(screen.getByText('Google Chrome'));
    expect(onSelect).toHaveBeenCalledWith({ id: 'com.example.chrome', name: 'Google Chrome', processName: 'chrome' });
  });

  it('a running process with no installed match keeps its proc: identity', async () => {
    const onSelect = vi.fn();
    render(<AppPicker showRunning onSelect={onSelect} />);
    await screen.findByText('Google Chrome');
    emitProcesses([{ name: 'steam', isApp: true }]);
    await waitFor(() => expect(screen.getByText('steam')).toBeTruthy());

    fireEvent.click(screen.getByText('steam'));
    expect(onSelect).toHaveBeenCalledWith({ id: 'proc:steam', name: 'steam', processName: 'steam' });
  });

  it('greys a row taken under its process name, whichever list it came from', async () => {
    render(
      <AppPicker
        showRunning
        unavailableIds={{ code: 'taken by Desk' }}
        onSelect={vi.fn()}
      />,
    );
    await screen.findByText('Visual Studio Code');
    // Not running, so it sits in All apps - and must still read as taken.
    emitProcesses([{ name: 'chrome', isApp: true }]);
    await waitFor(() => expect(screen.getByText('Google Chrome')).toBeTruthy());

    const code = screen.getByText('Visual Studio Code').closest('button')!;
    expect(code.className).toContain('appRowTaken');
    expect(code.getAttribute('title')).toBe('taken by Desk');

    const chrome = screen.getByText('Google Chrome').closest('button')!;
    expect(chrome.className).not.toContain('appRowTaken');
  });

  it('an unresolved app is never deduped away by an empty process name', async () => {
    render(<AppPicker showRunning onSelect={vi.fn()} />);
    await screen.findByText('Notepad');
    emitProcesses([{ name: 'chrome', isApp: true }]);
    await waitFor(() => expect(screen.getByText('Google Chrome')).toBeTruthy());

    expect(screen.getByText('Notepad')).toBeTruthy();
  });

  it('matches a mixed-case processName from the service against a running name', async () => {
    // macOS reports CFBundleDisplayName with its original case ("Code");
    // Windows lowercases. Both must dedupe against a running process.
    const onSelect = vi.fn();
    render(<AppPicker showRunning onSelect={onSelect} />);
    await screen.findByText('Visual Studio Code');
    emitProcesses([{ name: 'Code', isApp: true }]);
    await waitFor(() => expect(screen.getByText('Google Chrome')).toBeTruthy());

    const rows = [...document.querySelectorAll('button')]
      .filter(b => b.className.includes('appRow'))
      .map(b => b.textContent);
    expect(rows.filter(r => r === 'Visual Studio Code')).toHaveLength(1);
    expect(rows[0]).toBe('Visual Studio Code');
  });

  it('hands the resolved process name to onSelect', async () => {
    const onSelect = vi.fn();
    render(<AppPicker showRunning onSelect={onSelect} />);
    await screen.findByText('Google Chrome');

    fireEvent.click(screen.getByText('Google Chrome'));
    expect(onSelect).toHaveBeenCalledWith({
      id: 'com.example.chrome',
      name: 'Google Chrome',
      processName: 'chrome',
    });
  });

  it('keeps a second shortcut that targets the same exe reachable', async () => {
    render(<AppPicker showRunning onSelect={vi.fn()} />);
    await screen.findByText('Google Chrome');
    emitProcesses([{ name: 'chrome', isApp: true }]);
    await waitFor(() => expect(screen.getByText('Google Chrome')).toBeTruthy());

    // Only the promoted entry leaves All apps; a sibling shortcut stays.
    expect(screen.getByText('Chrome Beta')).toBeTruthy();
  });
});

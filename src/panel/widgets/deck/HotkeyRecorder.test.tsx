import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HotkeyRecorder } from './HotkeyRecorder';
import { setHotkeysSuspended } from '../../../api/hotkeys';

vi.mock('../../../api/hotkeys', async importActual => ({
  ...(await importActual<typeof import('../../../api/hotkeys')>()),
  setHotkeysSuspended: vi.fn().mockResolvedValue({ ok: false, msg: '' }),
}));

afterEach(() => vi.clearAllMocks());

describe('HotkeyRecorder', () => {
  it('has no preset dropdown and shows the display text', () => {
    render(<HotkeyRecorder value="Ctrl+Alt+n" display="Ctrl + Alt + N" onChange={vi.fn()} />);
    expect(screen.getByText('Ctrl + Alt + N')).toBeInTheDocument();
    expect(screen.queryByText('panel.settings.deck.hotkeyPreset.placeholder')).toBeNull();
  });

  it('suspends every OS hotkey while recording and resumes once the chord lands', () => {
    const onChange = vi.fn();
    render(<HotkeyRecorder value="" onChange={onChange} />);
    const field = screen.getByText('panel.settings.deck.hotkeySet');
    fireEvent.click(field);
    expect(setHotkeysSuspended).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(field, { code: 'KeyK', ctrlKey: true, altKey: true });
    expect(onChange).toHaveBeenCalledWith('ctrl+alt+k');
    expect(setHotkeysSuspended).toHaveBeenLastCalledWith(false);
    expect(setHotkeysSuspended).toHaveBeenCalledTimes(2);
  });

  it('resumes when recording is abandoned by blur', () => {
    render(<HotkeyRecorder value="" onChange={vi.fn()} />);
    const field = screen.getByText('panel.settings.deck.hotkeySet');
    fireEvent.click(field);
    fireEvent.blur(field);
    expect(setHotkeysSuspended).toHaveBeenLastCalledWith(false);
  });

  it('resumes when unmounted mid-recording', () => {
    const { unmount } = render(<HotkeyRecorder value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByText('panel.settings.deck.hotkeySet'));
    unmount();
    expect(setHotkeysSuspended).toHaveBeenLastCalledWith(false);
  });

  it('refreshes the suspension while recording so the service does not auto-resume', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<HotkeyRecorder value="" onChange={vi.fn()} />);
      fireEvent.click(screen.getByText('panel.settings.deck.hotkeySet'));
      vi.advanceTimersByTime(21_000);
      expect(vi.mocked(setHotkeysSuspended).mock.calls.filter(c => c[0] === true).length).toBe(2);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels on a bare Esc: keeps the old value, resumes, and shows the hint while recording', () => {
    const onChange = vi.fn();
    render(<HotkeyRecorder value="ctrl+k" onChange={onChange} />);
    const field = screen.getByText('ctrl+k');
    fireEvent.click(field);
    expect(screen.getByText('hotkeys.cancelHint')).toBeInTheDocument();
    fireEvent.keyDown(field, { code: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(setHotkeysSuspended).toHaveBeenLastCalledWith(false);
    expect(screen.getByText('ctrl+k')).toBeInTheDocument();
  });

  it('still records Esc with a modifier', () => {
    const onChange = vi.fn();
    render(<HotkeyRecorder value="" onChange={onChange} />);
    const field = screen.getByText('panel.settings.deck.hotkeySet');
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'Escape', ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith('ctrl+escape');
  });
});

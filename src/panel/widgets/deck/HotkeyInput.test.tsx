import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HotkeyInput } from './HotkeyInput';

describe('HotkeyInput capture', () => {
  it('shows the set-hotkey placeholder, then the capture prompt once clicked', () => {
    render(<HotkeyInput value="" onChange={vi.fn()} />);
    expect(screen.getByText('panel.settings.deck.hotkeySet')).toBeInTheDocument();
    fireEvent.click(screen.getByText('panel.settings.deck.hotkeySet'));
    expect(screen.getByText('panel.settings.deck.hotkeyCapture')).toBeInTheDocument();
  });

  it('shows the current value when set and not capturing', () => {
    render(<HotkeyInput value="ctrl+m" onChange={vi.fn()} />);
    expect(screen.getByText('ctrl+m')).toBeInTheDocument();
  });

  it('captures ctrl+m and reports it', () => {
    const onChange = vi.fn();
    render(<HotkeyInput value="" onChange={onChange} />);
    const field = screen.getByText('panel.settings.deck.hotkeySet');
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'KeyM', ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith('ctrl+m');
  });

  it('captures the new printscreen and period tokens', () => {
    const onChange = vi.fn();
    render(<HotkeyInput value="" onChange={onChange} />);
    const field = screen.getByText('panel.settings.deck.hotkeySet');

    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'PrintScreen', metaKey: true });
    expect(onChange).toHaveBeenLastCalledWith('meta+printscreen');

    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'Period', metaKey: true });
    expect(onChange).toHaveBeenLastCalledWith('meta+.');
  });

  it('ignores keys no injector can send (unmapped punctuation)', () => {
    const onChange = vi.fn();
    render(<HotkeyInput value="" onChange={onChange} />);
    const field = screen.getByText('panel.settings.deck.hotkeySet');
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'Comma', ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores a bare modifier keydown, waiting for the following non-modifier key', () => {
    const onChange = vi.fn();
    render(<HotkeyInput value="" onChange={onChange} />);
    const field = screen.getByText('panel.settings.deck.hotkeySet');
    fireEvent.click(field);
    fireEvent.keyDown(field, { code: 'ControlLeft', ctrlKey: true });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { code: 'KeyX', ctrlKey: true });
    expect(onChange).toHaveBeenCalledWith('ctrl+x');
  });
});

describe('HotkeyInput preset dropdown', () => {
  function openPresets() {
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.hotkeyPreset.placeholder' }));
  }

  it('renders the preset dropdown above the field, showing category headers and entries', () => {
    render(<HotkeyInput value="" onChange={vi.fn()} />);
    openPresets();
    expect(screen.getByText('panel.settings.deck.hotkeyPreset.category.editing')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.hotkeyPreset.cut')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.hotkeyPreset.category.screenshots')).toBeInTheDocument();
    expect(screen.getByText('panel.settings.deck.hotkeyPreset.openGameBar')).toBeInTheDocument();
  });

  it('picking a preset fills the field with its keys, without changing the always-shown placeholder', () => {
    const onChange = vi.fn();
    render(<HotkeyInput value="" onChange={onChange} />);
    openPresets();
    fireEvent.click(screen.getByText('panel.settings.deck.hotkeyPreset.copy'));
    expect(onChange).toHaveBeenCalledWith('ctrl+c');
    expect(screen.getByRole('button', { name: 'panel.settings.deck.hotkeyPreset.placeholder' })).toBeInTheDocument();
  });

  it('does not select the category header row itself', () => {
    const onChange = vi.fn();
    render(<HotkeyInput value="" onChange={onChange} />);
    openPresets();
    const header = screen.getByText('panel.settings.deck.hotkeyPreset.category.general');
    fireEvent.click(header);
    expect(onChange).not.toHaveBeenCalled();
  });
});

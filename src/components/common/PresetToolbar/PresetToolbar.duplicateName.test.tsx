import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PresetToolbar, type PresetToolbarPreset } from './PresetToolbar';

// PromptModal is intentionally left un-mocked here (unlike PresetToolbar.test.tsx)
// so the duplicate-name `validate` wiring can be exercised end to end through
// the real live-on-type validation path.

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return key + ':' + JSON.stringify(params);
    }
    return key;
  }}),
}));

vi.mock('../../../lib/platform', () => ({
  isApplePlatform: () => false,
}));

vi.mock('../Select/Select', () => ({
  Select: ({ value, onChange, ariaLabel, placeholder, options }: { value: string; onChange: (v: string) => void; ariaLabel?: string; placeholder?: string; options?: Array<{ value: string; label: string; disabled?: boolean }> }) => {
    const matched = options?.find(o => o.value === value);
    const displayText = matched ? matched.label : (placeholder ?? '');
    return (
      <>
        <button aria-label={ariaLabel} data-testid="preset-trigger">{displayText}</button>
        <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} data-testid="preset-select">
          {options?.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
      </>
    );
  },
}));

vi.mock('../HoverTooltip/HoverTooltip', () => ({
  HoverTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../ConfirmModal/ConfirmModal', () => ({
  ConfirmModal: () => null,
}));

const PRESET_A: PresetToolbarPreset = { id: 'a', name: 'My Preset' };
const PRESET_B: PresetToolbarPreset = { id: 'b', name: 'Other Preset' };

function defaultProps(overrides: Partial<Parameters<typeof PresetToolbar>[0]> = {}) {
  return {
    presets: [PRESET_A, PRESET_B],
    activeId: null,
    presetCount: 2,
    canUndo: false,
    canRedo: false,
    onLoad: vi.fn(),
    onCreate: vi.fn(() => Promise.resolve({ error: false })),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onReset: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    ...overrides,
  };
}

function openCreatePrompt() {
  fireEvent.change(screen.getByTestId('preset-select'), { target: { value: '__create__' } });
}

function openRenamePrompt() {
  fireEvent.change(screen.getByTestId('preset-select'), { target: { value: '__rename__' } });
}

describe('PresetToolbar duplicate-name validation (create)', () => {
  it('typing an existing preset name shows the duplicate notice and disables confirm', () => {
    render(<PresetToolbar {...defaultProps()} />);
    openCreatePrompt();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My Preset' } });

    expect(screen.getByRole('alert')).toHaveTextContent('lighting.layoutPresets.duplicateName');
    expect(screen.getByRole('button', { name: 'lighting.layoutPresets.new' })).toBeDisabled();
  });

  it('matches case-insensitively and after trimming', () => {
    render(<PresetToolbar {...defaultProps()} />);
    openCreatePrompt();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  my preset  ' } });

    expect(screen.getByRole('alert')).toHaveTextContent('lighting.layoutPresets.duplicateName');
  });

  it('a unique name shows no notice and enables confirm', () => {
    render(<PresetToolbar {...defaultProps()} />);
    openCreatePrompt();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Brand New Preset' } });

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'lighting.layoutPresets.new' })).not.toBeDisabled();
  });
});

describe('PresetToolbar duplicate-name validation (rename)', () => {
  it('typing another preset\'s name blocks the rename', () => {
    render(<PresetToolbar {...defaultProps({ activeId: 'a' })} />);
    openRenamePrompt();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Other Preset' } });

    expect(screen.getByRole('alert')).toHaveTextContent('lighting.layoutPresets.duplicateName');
    expect(screen.getByRole('button', { name: 'lighting.layoutPresets.rename' })).toBeDisabled();
  });

  it('keeping the preset\'s own current name is allowed', () => {
    render(<PresetToolbar {...defaultProps({ activeId: 'a' })} />);
    openRenamePrompt();

    // The prompt opens pre-filled with the preset's own current name.
    expect(screen.getByRole('textbox')).toHaveValue('My Preset');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'lighting.layoutPresets.rename' })).not.toBeDisabled();
  });
});

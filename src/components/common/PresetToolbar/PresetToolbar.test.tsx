import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PresetToolbar, type PresetToolbarPreset } from './PresetToolbar';

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

vi.mock('../PromptModal/PromptModal', () => ({
  PromptModal: () => null,
}));

const PRESET_A: PresetToolbarPreset = { id: 'a', name: 'My Preset' };

function defaultProps(overrides: Partial<Parameters<typeof PresetToolbar>[0]> = {}) {
  return {
    presets: [],
    activeId: null,
    presetCount: 0,
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

describe('PresetToolbar (lighting layout-preset mode)', () => {
  it('trigger shows placeholder when no preset is active', () => {
    render(<PresetToolbar {...defaultProps()} />);
    expect(screen.getByTestId('preset-trigger')).toHaveTextContent('lighting.layoutPresets.placeholder');
  });

  it('no Default option in the dropdown list', () => {
    render(<PresetToolbar {...defaultProps()} />);
    const opts = screen.queryAllByRole('option');
    const labels = opts.map(o => o.textContent ?? '');
    expect(labels).not.toContain('lighting.layoutPresets.default');
  });

  it('trigger shows preset name when a preset is active', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a' })} />);
    expect(screen.getByTestId('preset-trigger')).toHaveTextContent('My Preset');
  });

  it('renders a select when no active preset', () => {
    render(<PresetToolbar {...defaultProps()} />);
    const sel = screen.getByTestId('preset-select');
    expect(sel).toBeTruthy();
  });

  it('renders a select when active preset is set', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a' })} />);
    const sel = screen.getByTestId('preset-select');
    expect(sel).toBeTruthy();
  });

  it('reset button is present by default (showHistory defaults to true)', () => {
    render(<PresetToolbar {...defaultProps()} />);
    const resetBtn = screen.getByRole('button', { name: 'lighting.layoutPresets.reset' });
    expect(resetBtn).toBeTruthy();
  });

  it('undo button is disabled when canUndo=false', () => {
    render(<PresetToolbar {...defaultProps({ canUndo: false })} />);
    const undoBtn = screen.getByRole('button', { name: 'lighting.layoutPresets.undo' });
    expect(undoBtn).toBeDisabled();
  });

  it('undo button is enabled when canUndo=true', () => {
    render(<PresetToolbar {...defaultProps({ canUndo: true })} />);
    const undoBtn = screen.getByRole('button', { name: 'lighting.layoutPresets.undo' });
    expect(undoBtn).not.toBeDisabled();
  });

  it('redo button is disabled when canRedo=false', () => {
    render(<PresetToolbar {...defaultProps({ canRedo: false })} />);
    const redoBtn = screen.getByRole('button', { name: 'lighting.layoutPresets.redo' });
    expect(redoBtn).toBeDisabled();
  });

  it('redo button is enabled when canRedo=true', () => {
    render(<PresetToolbar {...defaultProps({ canRedo: true })} />);
    const redoBtn = screen.getByRole('button', { name: 'lighting.layoutPresets.redo' });
    expect(redoBtn).not.toBeDisabled();
  });

  it('disables the "New preset..." option at the cap', () => {
    const presets = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Preset ${i}` }));
    render(<PresetToolbar {...defaultProps({ presets, presetCount: 10 })} />);
    const createOption = screen.getByRole('option', { name: 'lighting.layoutPresets.newOption' });
    expect(createOption).toBeDisabled();
  });

  it('does not disable "New preset..." below the cap', () => {
    const presets = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `Preset ${i}` }));
    render(<PresetToolbar {...defaultProps({ presets, presetCount: 9 })} />);
    const createOption = screen.getByRole('option', { name: 'lighting.layoutPresets.newOption' });
    expect(createOption).not.toBeDisabled();
  });
});

describe('PresetToolbar (deck preset mode, showHistory=false)', () => {
  function deckProps(overrides: Partial<Parameters<typeof PresetToolbar>[0]> = {}) {
    return defaultProps({ showHistory: false, ...overrides });
  }

  it('hides the reset button', () => {
    render(<PresetToolbar {...deckProps()} />);
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.reset' })).toBeNull();
  });

  it('hides the undo button', () => {
    render(<PresetToolbar {...deckProps()} />);
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.undo' })).toBeNull();
  });

  it('hides the redo button', () => {
    render(<PresetToolbar {...deckProps()} />);
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.redo' })).toBeNull();
  });

  it('still renders the preset select', () => {
    render(<PresetToolbar {...deckProps({ presets: [PRESET_A], activeId: 'a' })} />);
    expect(screen.getByTestId('preset-trigger')).toHaveTextContent('My Preset');
  });

  it('still offers rename/delete for the active preset and create at the cap', () => {
    const presets = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Preset ${i}` }));
    render(<PresetToolbar {...deckProps({ presets, activeId: 'p0', presetCount: 10 })} />);
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.rename' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.delete' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.newOption' })).toBeDisabled();
  });
});

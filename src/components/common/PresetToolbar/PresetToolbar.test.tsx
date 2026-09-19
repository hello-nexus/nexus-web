import { render, screen, fireEvent } from '@testing-library/react';
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
  Select: ({ value, onChange, ariaLabel, placeholder, options }: { value: string; onChange: (v: string) => void; ariaLabel?: string; placeholder?: string; options?: Array<{ value: string; label: string; disabled?: boolean; icon?: React.ReactNode }> }) => {
    const matched = options?.find(o => o.value === value);
    const displayText = matched ? matched.label : (placeholder ?? '');
    return (
      <>
        <button aria-label={ariaLabel} data-testid="preset-trigger">{displayText}</button>
        <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} data-testid="preset-select">
          {options?.map(o => (
            <option key={o.value} value={o.value} disabled={o.disabled} data-icon={o.icon ? 'yes' : 'no'}>
              {o.label}
            </option>
          ))}
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

describe('PresetToolbar (showHistory=false)', () => {
  function noHistoryProps(overrides: Partial<Parameters<typeof PresetToolbar>[0]> = {}) {
    return defaultProps({ showHistory: false, ...overrides });
  }

  it('hides the reset button', () => {
    render(<PresetToolbar {...noHistoryProps()} />);
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.reset' })).toBeNull();
  });

  it('hides the undo button', () => {
    render(<PresetToolbar {...noHistoryProps()} />);
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.undo' })).toBeNull();
  });

  it('hides the redo button', () => {
    render(<PresetToolbar {...noHistoryProps()} />);
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.redo' })).toBeNull();
  });

  it('still renders the preset select', () => {
    render(<PresetToolbar {...noHistoryProps({ presets: [PRESET_A], activeId: 'a' })} />);
    expect(screen.getByTestId('preset-trigger')).toHaveTextContent('My Preset');
  });

  it('still offers rename/delete for the active preset and create at the cap', () => {
    const presets = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Preset ${i}` }));
    render(<PresetToolbar {...noHistoryProps({ presets, activeId: 'p0', presetCount: 10 })} />);
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.rename' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.delete' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.newOption' })).toBeDisabled();
  });
});

describe('PresetToolbar (allowCreateRename=false)', () => {
  it('hides the "New preset..." option', () => {
    render(<PresetToolbar {...defaultProps({ allowCreateRename: false })} />);
    expect(screen.queryByRole('option', { name: 'lighting.layoutPresets.newOption' })).toBeNull();
  });

  it('hides the rename option for the active preset', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a', allowCreateRename: false })} />);
    expect(screen.queryByRole('option', { name: 'lighting.layoutPresets.rename' })).toBeNull();
  });

  it('still offers delete for the active preset', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a', allowCreateRename: false })} />);
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.delete' })).toBeTruthy();
  });

  it('still lists existing presets for switching', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: null, allowCreateRename: false })} />);
    expect(screen.getByRole('option', { name: 'My Preset' })).toBeTruthy();
  });

  it('defaults to allowing create/rename when the prop is omitted', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a' })} />);
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.rename' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.newOption' })).toBeTruthy();
  });
});

describe('PresetToolbar (allowDelete=false)', () => {
  it('hides the delete option for the active preset', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a', allowDelete: false })} />);
    expect(screen.queryByRole('option', { name: 'lighting.layoutPresets.delete' })).toBeNull();
  });

  it('still offers rename and lists presets for switching', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a', allowDelete: false })} />);
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.rename' })).toBeTruthy();
  });

  it('defaults to allowing delete when the prop is omitted', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a' })} />);
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.delete' })).toBeTruthy();
  });
});

describe('PresetToolbar (resetLabelKey/resetConfirmKey overrides)', () => {
  it('uses the override key for the reset button instead of translationPrefix.reset', () => {
    render(<PresetToolbar {...defaultProps({ resetLabelKey: 'devices.streamdeck.presets.reset' })} />);
    expect(screen.getByRole('button', { name: 'devices.streamdeck.presets.reset' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.reset' })).toBeNull();
  });

  it('falls back to translationPrefix.reset when no override is given', () => {
    render(<PresetToolbar {...defaultProps()} />);
    expect(screen.getByRole('button', { name: 'lighting.layoutPresets.reset' })).toBeTruthy();
  });
});

describe('PresetToolbar (onImport)', () => {
  it('does not render an import option when onImport is omitted (every existing caller)', () => {
    render(<PresetToolbar {...defaultProps()} />);
    expect(screen.queryByRole('option', { name: 'lighting.layoutPresets.importOption' })).toBeNull();
  });

  it('appends an import option after "New preset..." when onImport is set', () => {
    render(<PresetToolbar {...defaultProps({ onImport: vi.fn() })} />);
    const options = screen.getAllByRole('option').map(o => o.textContent);
    const createIndex = options.indexOf('lighting.layoutPresets.newOption');
    const importIndex = options.indexOf('lighting.layoutPresets.importOption');
    expect(createIndex).toBeGreaterThanOrEqual(0);
    expect(importIndex).toBeGreaterThan(createIndex);
  });

  it('uses importLabelKey to override the option label', () => {
    render(<PresetToolbar {...defaultProps({ onImport: vi.fn(), importLabelKey: 'devices.streamdeck.presets.importOption' })} />);
    expect(screen.getByRole('option', { name: 'devices.streamdeck.presets.importOption' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'lighting.layoutPresets.importOption' })).toBeNull();
  });

  it('fires onImport when the import option is selected', () => {
    const onImport = vi.fn();
    render(<PresetToolbar {...defaultProps({ onImport })} />);
    fireEvent.change(screen.getByTestId('preset-select'), { target: { value: '__import__' } });
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it('disables the import option at the cap, like create', () => {
    const presets = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Preset ${i}` }));
    render(<PresetToolbar {...defaultProps({ presets, presetCount: 10, onImport: vi.fn() })} />);
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.importOption' })).toBeDisabled();
  });

  it('does not disable the import option below the cap', () => {
    const presets = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `Preset ${i}` }));
    render(<PresetToolbar {...defaultProps({ presets, presetCount: 9, onImport: vi.fn() })} />);
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.importOption' })).not.toBeDisabled();
  });

  // ---- app bindings ----

  it('hides the apps option without onManageApps', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a', presetCount: 1 })} />);
    expect(screen.queryByRole('option', { name: 'lighting.layoutPresets.apps' })).toBeNull();
  });

  it('offers the apps option when a preset is active', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a', presetCount: 1, onManageApps: vi.fn() })} />);
    expect(screen.getByRole('option', { name: 'lighting.layoutPresets.apps' })).toBeTruthy();
  });

  it('hides the apps option with no preset active - it edits the active one', () => {
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: null, presetCount: 1, onManageApps: vi.fn() })} />);
    expect(screen.queryByRole('option', { name: 'lighting.layoutPresets.apps' })).toBeNull();
  });

  it('fires onManageApps when the apps option is selected', () => {
    const onManageApps = vi.fn();
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a', presetCount: 1, onManageApps })} />);
    fireEvent.change(screen.getByTestId('preset-select'), { target: { value: '__apps__' } });
    expect(onManageApps).toHaveBeenCalledTimes(1);
  });

  it('marks a preset that apps activate with a glyph', () => {
    const bound: PresetToolbarPreset = { id: 'b', name: 'Bound', hasApps: true };
    render(<PresetToolbar {...defaultProps({ presets: [PRESET_A, bound], activeId: 'a', presetCount: 2 })} />);
    expect(screen.getByRole('option', { name: 'Bound' }).getAttribute('data-icon')).toBe('yes');
    expect(screen.getByRole('option', { name: 'My Preset' }).getAttribute('data-icon')).toBe('no');
  });
});

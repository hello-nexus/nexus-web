import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('PresetToolbar create modal (New preset / Duplicate current)', () => {
  it('titles the create modal with the createTitle key and the rename modal with namePrompt', () => {
    render(<PresetToolbar {...defaultProps({ activeId: 'a' })} />);
    openCreatePrompt();
    expect(screen.getByRole('heading')).toHaveTextContent('lighting.layoutPresets.createTitle');
    fireEvent.click(screen.getByRole('button', { name: 'confirm.cancel' }));
    openRenamePrompt();
    expect(screen.getByRole('heading')).toHaveTextContent('lighting.layoutPresets.namePrompt');
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.duplicateCurrent' })).toBeNull();
  });

  it('hides Duplicate current when no preset is active', () => {
    render(<PresetToolbar {...defaultProps()} />);
    openCreatePrompt();
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.duplicateCurrent' })).toBeNull();
  });

  it('hides Duplicate current while a built-in entry is active', () => {
    render(<PresetToolbar {...defaultProps({ activeId: 'a', builtins: [{ id: 'x', label: 'X' }], activeBuiltinId: 'x' })} />);
    openCreatePrompt();
    expect(screen.queryByRole('button', { name: 'lighting.layoutPresets.duplicateCurrent' })).toBeNull();
  });

  it('New preset calls onCreate with fresh: true', async () => {
    const props = defaultProps({ activeId: 'a' });
    render(<PresetToolbar {...props} />);
    openCreatePrompt();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Brand New' } });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.new' }));
    await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith('Brand New', { fresh: true }));
  });

  it('Duplicate current calls onCreate with fresh: false and closes the modal', async () => {
    const props = defaultProps({ activeId: 'a' });
    render(<PresetToolbar {...props} />);
    openCreatePrompt();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Copy' } });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.duplicateCurrent' }));
    await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith('Copy', { fresh: false }));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('Duplicate current shows the service error and keeps the modal open', async () => {
    const props = defaultProps({ activeId: 'a', onCreate: vi.fn(() => Promise.resolve({ error: true, msg: 'Nope' })) });
    render(<PresetToolbar {...props} />);
    openCreatePrompt();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Copy' } });
    fireEvent.click(screen.getByRole('button', { name: 'lighting.layoutPresets.duplicateCurrent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nope');
  });
});

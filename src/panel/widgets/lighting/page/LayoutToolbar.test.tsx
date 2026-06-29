import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LayoutToolbar } from './LayoutToolbar';
import type { LayoutPreset, LightingDevice } from '../../../../api/lighting';
import { devicesToLayouts } from './useLayoutPresets';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return key + ':' + JSON.stringify(params);
    }
    return key;
  }}),
}));

vi.mock('../../../../lib/platform', () => ({
  isApplePlatform: () => false,
}));

vi.mock('../../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, ariaLabel, placeholder, options }: { value: string; onChange: (v: string) => void; ariaLabel?: string; placeholder?: string; options?: Array<{ value: string; label: string }> }) => {
    const matched = options?.find(o => o.value === value);
    const displayText = matched ? matched.label : (placeholder ?? '');
    return (
      <>
        <button aria-label={ariaLabel} data-testid="preset-trigger">{displayText}</button>
        <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} data-testid="preset-select">
          {options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </>
    );
  },
}));

vi.mock('../../../../components/common/HoverTooltip/HoverTooltip', () => ({
  HoverTooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../../components/common/ConfirmModal/ConfirmModal', () => ({
  ConfirmModal: () => null,
}));

vi.mock('../../../../components/common/PromptModal/PromptModal', () => ({
  PromptModal: () => null,
}));

const PRESET_A: LayoutPreset = { id: 'a', name: 'My Preset', layouts: {} };

function defaultProps(overrides: Partial<Parameters<typeof LayoutToolbar>[0]> = {}) {
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

describe('LayoutToolbar', () => {
  it('trigger shows placeholder when no preset is active', () => {
    render(<LayoutToolbar {...defaultProps()} />);
    expect(screen.getByTestId('preset-trigger')).toHaveTextContent('lighting.layoutPresets.placeholder');
  });

  it('no Default option in the dropdown list', () => {
    render(<LayoutToolbar {...defaultProps()} />);
    const opts = screen.queryAllByRole('option');
    const labels = opts.map(o => o.textContent ?? '');
    expect(labels).not.toContain('lighting.layoutPresets.default');
  });

  it('trigger shows preset name when a preset is active', () => {
    render(<LayoutToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a' })} />);
    expect(screen.getByTestId('preset-trigger')).toHaveTextContent('My Preset');
  });

  it('renders a select when no active preset', () => {
    render(<LayoutToolbar {...defaultProps()} />);
    const sel = screen.getByTestId('preset-select');
    expect(sel).toBeTruthy();
  });

  it('renders a select when active preset is set', () => {
    render(<LayoutToolbar {...defaultProps({ presets: [PRESET_A], activeId: 'a' })} />);
    const sel = screen.getByTestId('preset-select');
    expect(sel).toBeTruthy();
  });

  it('reset button is always present', () => {
    render(<LayoutToolbar {...defaultProps()} />);
    const resetBtn = screen.getByRole('button', { name: 'lighting.layoutPresets.reset' });
    expect(resetBtn).toBeTruthy();
  });

  it('undo button is disabled when canUndo=false', () => {
    render(<LayoutToolbar {...defaultProps({ canUndo: false })} />);
    const undoBtn = screen.getByRole('button', { name: 'lighting.layoutPresets.undo' });
    expect(undoBtn).toBeDisabled();
  });

  it('undo button is enabled when canUndo=true', () => {
    render(<LayoutToolbar {...defaultProps({ canUndo: true })} />);
    const undoBtn = screen.getByRole('button', { name: 'lighting.layoutPresets.undo' });
    expect(undoBtn).not.toBeDisabled();
  });

  it('redo button is disabled when canRedo=false', () => {
    render(<LayoutToolbar {...defaultProps({ canRedo: false })} />);
    const redoBtn = screen.getByRole('button', { name: 'lighting.layoutPresets.redo' });
    expect(redoBtn).toBeDisabled();
  });

  it('redo button is enabled when canRedo=true', () => {
    render(<LayoutToolbar {...defaultProps({ canRedo: true })} />);
    const redoBtn = screen.getByRole('button', { name: 'lighting.layoutPresets.redo' });
    expect(redoBtn).not.toBeDisabled();
  });
});

describe('devicesToLayouts', () => {
  it('converts devices array to layout map', () => {
    const devices = [
      { id: 'd1', canvasX: 10, canvasY: 20, canvasW: 100, canvasH: 50, canvasRotation: 90 } as unknown as LightingDevice,
      { id: 'd2', canvasX: 0, canvasY: 0, canvasW: 60, canvasH: 30 } as unknown as LightingDevice,
    ];
    const layouts = devicesToLayouts(devices);
    expect(layouts['d1']).toEqual({ x: 10, y: 20, w: 100, h: 50, rotation: 90 });
    expect(layouts['d2']).toEqual({ x: 0, y: 0, w: 60, h: 30, rotation: 0 });
  });
});

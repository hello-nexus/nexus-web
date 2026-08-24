import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PresetApp } from '../../../../api/lighting';
import { PresetAppsModal } from './PresetAppsModal';

// The picker itself needs the service's /shortcuts response and a live
// processes topic; this exercises the modal's own selection state.
vi.mock('../../common/AppPicker', () => ({
  AppPicker: ({ selectedIds, onSelect }: {
    selectedIds?: string[];
    onSelect: (app: PresetApp) => void;
  }) => (
    <div>
      <span data-testid="selected">{(selectedIds ?? []).join(',')}</span>
      <button type="button" onClick={() => onSelect({ id: 'proc:chrome', name: 'chrome' })}>
        pick-chrome
      </button>
      <button type="button" onClick={() => onSelect({ id: 'proc:code', name: 'code' })}>
        pick-code
      </button>
    </div>
  ),
}));

const CHROME: PresetApp = { id: 'proc:chrome', name: 'chrome' };

function renderModal(apps: PresetApp[] = [], onSave = vi.fn(), onClose = vi.fn()) {
  const view = render(
    <PresetAppsModal presetName="Gaming" apps={apps} onSave={onSave} onClose={onClose} />,
  );
  return { onSave, onClose, view };
}

describe('PresetAppsModal', () => {
  it('seeds the selection from the preset bindings', () => {
    renderModal([CHROME]);
    expect(screen.getByTestId('selected').textContent).toBe('proc:chrome');
  });

  it('adds a picked app to the selection', () => {
    renderModal();
    fireEvent.click(screen.getByText('pick-code'));
    expect(screen.getByTestId('selected').textContent).toBe('proc:code');
  });

  it('picking a selected app removes it', () => {
    renderModal([CHROME]);
    fireEvent.click(screen.getByText('pick-chrome'));
    expect(screen.getByTestId('selected').textContent).toBe('');
  });

  it('the chip remove button drops the binding', () => {
    renderModal([CHROME]);
    // No I18nProvider in the test tree, so t() yields the key itself.
    fireEvent.click(screen.getByLabelText('lighting.layoutPresets.appsRemove'));
    expect(screen.getByTestId('selected').textContent).toBe('');
  });

  it('saves the edited selection, not the incoming one', () => {
    const { onSave } = renderModal([CHROME]);
    fireEvent.click(screen.getByText('pick-code'));
    fireEvent.click(screen.getByText('lighting.layoutPresets.appsSave'));
    expect(onSave).toHaveBeenCalledWith([CHROME, { id: 'proc:code', name: 'code' }]);
  });

  it('cancel closes without saving', () => {
    const { onSave, onClose } = renderModal([CHROME]);
    fireEvent.click(screen.getByText('pick-code'));
    fireEvent.click(screen.getByText('confirm.cancel'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('a re-render with a fresh apps array keeps the unsaved selection', () => {
    // LightingPage rebuilds its props on every service frame; the modal must
    // seed once, not re-seed from a new array identity.
    const { view } = renderModal([CHROME]);
    fireEvent.click(screen.getByText('pick-code'));
    expect(screen.getByTestId('selected').textContent).toBe('proc:chrome,proc:code');

    view.rerender(
      <PresetAppsModal
        presetName="Gaming"
        apps={[{ id: 'proc:chrome', name: 'chrome' }]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('selected').textContent).toBe('proc:chrome,proc:code');
  });

  it('stays open until the save resolves', async () => {
    let resolveSave: () => void = () => {};
    const onSave = vi.fn(() => new Promise<void>(r => { resolveSave = r; }));
    const onClose = vi.fn();
    render(<PresetAppsModal presetName="Gaming" apps={[]} onSave={onSave} onClose={onClose} />);

    fireEvent.click(screen.getByText('pick-code'));
    fireEvent.click(screen.getByText('lighting.layoutPresets.appsSave'));

    // Save in flight: both buttons disabled, nothing closed yet.
    expect(screen.getByText('confirm.cancel').closest('button')).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { resolveSave(); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

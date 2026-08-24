import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PresetApp } from '../../../../api/lighting';
import { PresetAppsModal } from './PresetAppsModal';

// The picker itself needs the service's /shortcuts response and a live
// processes topic; this exercises the modal's own selection state.
vi.mock('../../common/AppPicker', () => ({
  AppPicker: ({ selectedIds, unavailableIds, onSelect }: {
    selectedIds?: string[];
    unavailableIds?: Record<string, string>;
    onSelect: (app: PresetApp) => void;
  }) => (
    <div>
      <span data-testid="selected">{(selectedIds ?? []).join(',')}</span>
      <span data-testid="unavailable">{Object.keys(unavailableIds ?? {}).sort().join(',')}</span>
      <button
        type="button"
        onClick={() => onSelect({ id: 'proc:chrome', name: 'chrome', processName: 'chrome' })}
      >
        pick-chrome
      </button>
      <button
        type="button"
        onClick={() => onSelect({ id: 'proc:code', name: 'code', processName: 'code' })}
      >
        pick-code
      </button>
      <button
        type="button"
        onClick={() => onSelect({ id: 'Steam', name: 'Steam', processName: 'steam' })}
      >
        pick-steam
      </button>
    </div>
  ),
}));

const CHROME: PresetApp = { id: 'proc:chrome', name: 'chrome' };

function renderModal(
  apps: PresetApp[] = [],
  onSave: (a: PresetApp[]) => string | null | Promise<string | null> = vi.fn(() => null),
  onClose = vi.fn(),
  taken: Record<string, string> = {},
) {
  const view = render(
    <PresetAppsModal
      presetName="Gaming"
      apps={apps}
      taken={taken}
      onSave={onSave}
      onClose={onClose}
    />,
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
    expect(onSave).toHaveBeenCalledWith([
      CHROME,
      { id: 'proc:code', name: 'code', processName: 'code' },
    ]);
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
        taken={{}}
        onSave={vi.fn(() => null)}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('selected').textContent).toBe('proc:chrome,proc:code');
  });

  it('stays open until the save resolves', async () => {
    let resolveSave: () => void = () => {};
    const onSave = vi.fn(() => new Promise<void>(r => { resolveSave = r; }));
    const onClose = vi.fn();
    render(<PresetAppsModal presetName="Gaming" apps={[]} taken={{}} onSave={onSave} onClose={onClose} />);

    fireEvent.click(screen.getByText('pick-code'));
    fireEvent.click(screen.getByText('lighting.layoutPresets.appsSave'));

    // Save in flight: both buttons disabled, nothing closed yet.
    expect(screen.getByText('confirm.cancel').closest('button')).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { resolveSave(); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('clear all empties the selection without saving', () => {
    const { onSave } = renderModal([CHROME, { id: 'proc:code', name: 'code' }]);
    fireEvent.click(screen.getByText('lighting.layoutPresets.appsClear'));
    expect(screen.getByTestId('selected').textContent).toBe('');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clear all is hidden with nothing bound', () => {
    renderModal([]);
    expect(screen.queryByText('lighting.layoutPresets.appsClear')).toBeNull();
  });

  // ---- one app, one preset ----

  it('refuses an app another preset already triggers, naming the owner', () => {
    renderModal([], vi.fn(() => null), vi.fn(), { 'proc:chrome': 'Desk' });
    fireEvent.click(screen.getByText('pick-chrome'));

    expect(screen.getByTestId('selected').textContent).toBe('');
    expect(screen.getByRole('alert').textContent).toBe('lighting.layoutPresets.appsTaken');
  });

  it('recognises the same app taken under its resolved process name', () => {
    // Bound elsewhere off the running list; picked here off the installed list.
    renderModal([], vi.fn(() => null), vi.fn(), { steam: 'Desk' });
    fireEvent.click(screen.getByText('pick-steam'));

    expect(screen.getByTestId('selected').textContent).toBe('');
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('passes the taken map to the picker so rows can be marked', () => {
    renderModal([], vi.fn(() => null), vi.fn(), { 'proc:chrome': 'Desk', steam: 'Desk' });
    expect(screen.getByTestId('unavailable').textContent).toBe('proc:chrome,steam');
  });

  it('removing an already-selected app is never blocked', () => {
    // Its owner is this preset, so it can appear in taken and still be removed.
    renderModal([CHROME], vi.fn(() => null), vi.fn(), { 'proc:chrome': 'Desk' });
    fireEvent.click(screen.getByText('pick-chrome'));
    expect(screen.getByTestId('selected').textContent).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces a conflict the server refused the save with', async () => {
    const onSave = vi.fn(() => Promise.resolve('taken by Desk'));
    const onClose = vi.fn();
    renderModal([], onSave, onClose);

    fireEvent.click(screen.getByText('pick-code'));
    fireEvent.click(screen.getByText('lighting.layoutPresets.appsSave'));
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByRole('alert').textContent).toBe('taken by Desk');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the edit and explains when the save fails outright', async () => {
    // Offline / 404 / 500: not a conflict, and emphatically not success.
    const onSave = vi.fn(() => Promise.resolve('could not save'));
    const onClose = vi.fn();
    renderModal([], onSave, onClose);

    fireEvent.click(screen.getByText('pick-code'));
    fireEvent.click(screen.getByText('lighting.layoutPresets.appsSave'));
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByRole('alert').textContent).toBe('could not save');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('selected').textContent).toBe('proc:code');
  });
});

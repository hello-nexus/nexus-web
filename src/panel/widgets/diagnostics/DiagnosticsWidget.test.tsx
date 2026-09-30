import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { PanelPreviewProvider } from '../common/PanelPreviewContext';
import { DiagnosticsWidget } from './DiagnosticsWidget';

vi.mock('../../../hooks/useUiSettings', () => ({
  useFeatureFlags: () => ({ diagnostics: true }),
}));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const widget = (size: PanelWidget['size']): PanelWidget => ({ id: 'diag', type: 'diagnostics', size, col: 0, row: 0 });

function renderWidget(size: PanelWidget['size'], onSectionNavigate?: () => void) {
  return render(
    <PanelPreviewProvider value={true}>
      <DiagnosticsWidget widget={widget(size)} onSectionNavigate={onSectionNavigate} />
    </PanelPreviewProvider>,
  );
}

describe('DiagnosticsWidget', () => {
  it('renders one status dot per domain at 2x2, GPU folded into Cooling', () => {
    renderWidget('2x2');
    expect(screen.getAllByRole('img').map(el => el.getAttribute('aria-label'))).toEqual([
      'diagnostics.kind.storage: diagnostics.status.ok',
      'diagnostics.kind.memory: diagnostics.status.ok',
      'diagnostics.kind.cooling: diagnostics.status.watch',
      'diagnostics.kind.system: diagnostics.status.ok',
    ]);
  });

  it('opens the matching diagnostics tab from each 4x2 button', () => {
    const onSectionNavigate = vi.fn();
    renderWidget('4x2', onSectionNavigate);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    fireEvent.click(screen.getByText('diagnostics.kind.cooling'));
    expect(onSectionNavigate).toHaveBeenCalledWith('diagnostics', { tab: 'cooling' });
  });

  it('renders plain blocks without a dashboard to navigate to', () => {
    renderWidget('4x2');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('diagnostics.kind.storage')).toBeTruthy();
  });
});

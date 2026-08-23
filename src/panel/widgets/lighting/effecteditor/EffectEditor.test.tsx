import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EffectEditor } from './EffectEditor';

vi.mock('../../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('EffectEditor', () => {
  const panes = { options: <p>options pane</p>, effect: <p>effect pane</p> };

  it('shows two tabs when no devices pane is given', () => {
    render(<EffectEditor {...panes} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: 'lighting.rightPane.devices' })).not.toBeInTheDocument();
  });

  // Static assigns per device, so that mode needs somewhere to choose targets.
  it('adds a leading Devices tab when one is given', () => {
    render(<EffectEditor {...panes} devices={<p>devices pane</p>} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent('lighting.rightPane.devices');

    fireEvent.click(tabs[0]);
    expect(screen.getByText('devices pane')).toBeInTheDocument();
    expect(screen.queryByText('options pane')).not.toBeInTheDocument();
  });

  it('falls back to Options when the selected tab goes away', () => {
    const { rerender } = render(<EffectEditor {...panes} devices={<p>devices pane</p>} />);
    fireEvent.click(screen.getByRole('tab', { name: 'lighting.rightPane.devices' }));
    expect(screen.getByText('devices pane')).toBeInTheDocument();

    // Leaving Static drops the pane; a tab that no longer exists must not stay selected.
    rerender(<EffectEditor {...panes} />);
    expect(screen.getByText('options pane')).toBeInTheDocument();
  });
});

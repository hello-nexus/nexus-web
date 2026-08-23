import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { ClockSettings } from './ClockSettings';

// Drive the dropdown as a native <select> so it stays a combobox, not a
// button: this suite asserts the design picker's button count.
vi.mock('../../../components/common/Select/Select', () => ({
  Select: ({ value, onChange, options, children, ariaLabel, disabled }: {
    value: string; onChange: (v: string) => void;
    options?: { value: string; label: string; disabled?: boolean }[]; children?: React.ReactNode;
    ariaLabel?: string; disabled?: boolean;
  }) => (
    <select aria-label={ariaLabel} value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
      {options ? options.map(o => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>) : children}
    </select>
  ),
}));

function clockWidget(design = 'analog', size = '4x2'): PanelWidget {
  return {
    id: 'clock-1',
    type: 'clock',
    size,
    col: 0,
    row: 0,
    config: {
      design,
    },
  };
}

describe('ClockSettings', () => {
  it('renders clock designs as icon label buttons', () => {
    render(<ClockSettings widget={clockWidget()} onUpdate={vi.fn()} onResize={vi.fn()} />);

    const labels = ['Digital', 'Analog', 'Split Flap', 'Rolling', 'LED', 'Dots', 'Matrix', 'Abstract'];
    // Design buttons carry aria-pressed; the timezone trigger (aria-expanded) does not.
    const designButtons = screen.getAllByRole('button').filter(b => b.hasAttribute('aria-pressed'));
    expect(designButtons).toHaveLength(labels.length);

    for (const label of labels) {
      expect(screen.getByRole('button', { name: label }).querySelector('svg')).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Analog' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Digital' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('updates the selected clock design', () => {
    const onUpdate = vi.fn();
    render(<ClockSettings widget={clockWidget()} onUpdate={onUpdate} onResize={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Split Flap' }));

    expect(onUpdate).toHaveBeenCalledWith({ design: 'splitflap' });
  });

  it('toggles the timezone label', () => {
    const onUpdate = vi.fn();
    render(<ClockSettings widget={clockWidget()} onUpdate={onUpdate} onResize={vi.fn()} />);

    fireEvent.click(screen.getByLabelText('panel.widget.clock.settings.showTimezone'));

    expect(onUpdate).toHaveBeenCalledWith({ showTimezone: true });
  });

  // Dimmed, not hidden: the row keeps its place and says why it is blocked.
  it('dims the vertical layout row on a size that cannot stack', () => {
    const wide = render(<ClockSettings widget={clockWidget('splitflap', '4x2')} onUpdate={vi.fn()} onResize={vi.fn()} />);
    const wideToggle = wide.getByLabelText('panel.widget.clock.settings.verticalLayout');
    expect(wideToggle).toBeDisabled();
    expect(wide.getByText('panel.widget.clock.settings.unavailableForSize')).toBeTruthy();

    wide.unmount();

    const tall = render(<ClockSettings widget={clockWidget('splitflap', '2x4')} onUpdate={vi.fn()} onResize={vi.fn()} />);
    expect(tall.getByLabelText('panel.widget.clock.settings.verticalLayout')).not.toBeDisabled();
  });

  it('dims the vertical layout row on a design that cannot stack', () => {
    const { getByLabelText, getByText } = render(
      <ClockSettings widget={clockWidget('analog', '2x4')} onUpdate={vi.fn()} onResize={vi.fn()} />,
    );

    expect(getByLabelText('panel.widget.clock.settings.verticalLayout')).toBeDisabled();
    expect(getByText('panel.widget.clock.settings.unavailableForDesign')).toBeTruthy();
  });

  it('dims the accent colour row on a design that has no accent', () => {
    const abstract = render(<ClockSettings widget={clockWidget('abstract', '2x4')} onUpdate={vi.fn()} onResize={vi.fn()} />);
    expect(abstract.getByLabelText('panel.widget.clock.settings.useAccentColor')).toBeDisabled();

    abstract.unmount();

    const digital = render(<ClockSettings widget={clockWidget('digital', '2x4')} onUpdate={vi.fn()} onResize={vi.fn()} />);
    expect(digital.getByLabelText('panel.widget.clock.settings.useAccentColor')).not.toBeDisabled();
  });

  it('saves the vertical layout choice on the widget', () => {
    const onUpdate = vi.fn();
    const { getByLabelText } = render(
      <ClockSettings widget={clockWidget('splitflap', '2x4')} onUpdate={onUpdate} onResize={vi.fn()} />,
    );

    fireEvent.click(getByLabelText('panel.widget.clock.settings.verticalLayout'));
    expect(onUpdate).toHaveBeenCalledWith({ layout: 'stacked' });
  });
});

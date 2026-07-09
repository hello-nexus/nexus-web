import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SystemSpecsPanel } from './SystemSpecsPanel';

const rows = [
  { label: 'Processor', value: 'AMD Ryzen 7 9800X3D' },
  { label: 'Motherboard', value: 'ASUS ROG Crosshair' },
];

describe('SystemSpecsPanel list variant', () => {
  it('renders every row as a label:value line', () => {
    render(<SystemSpecsPanel rows={rows} />);

    expect(screen.getByText('Processor')).toBeInTheDocument();
    expect(screen.getByText('AMD Ryzen 7 9800X3D')).toBeInTheDocument();
    expect(screen.getByText('Motherboard')).toBeInTheDocument();
    expect(screen.getByText('ASUS ROG Crosshair')).toBeInTheDocument();
  });

  it('shows a dash for a row with an empty value', () => {
    render(<SystemSpecsPanel rows={[{ label: 'Monitor', value: '' }]} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('blanks every value while loading instead of showing a dash', () => {
    render(<SystemSpecsPanel rows={[{ label: '', value: '' }]} loading />);
    expect(screen.queryByText('-')).not.toBeInTheDocument();
  });

  it('hides the copy toolbar when no copy labels are supplied', () => {
    render(<SystemSpecsPanel rows={rows} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('copies every row as "label: value" lines when Copy is clicked', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });

    render(<SystemSpecsPanel rows={rows} copyLabel="Copy" copiedLabel="Copied!" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(
      'Processor: AMD Ryzen 7 9800X3D\nMotherboard: ASUS ROG Crosshair',
    ));
    await screen.findByRole('button', { name: 'Copied!' });
  });

  it('disables the copy button while loading', () => {
    render(<SystemSpecsPanel rows={rows} loading copyLabel="Copy" copiedLabel="Copied!" />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });
});

describe('SystemSpecsPanel tiles variant', () => {
  it('renders one tile per row with its icon and value', () => {
    render(
      <SystemSpecsPanel
        variant="tiles"
        rows={[{ label: 'CPU', value: 'AMD Ryzen 7 9800X3D', icon: <span data-testid="cpu-icon" /> }]}
      />,
    );

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('AMD Ryzen 7 9800X3D')).toBeInTheDocument();
    expect(screen.getByTestId('cpu-icon')).toBeInTheDocument();
  });

  it('shows a dash for a tile with an empty value', () => {
    render(<SystemSpecsPanel variant="tiles" rows={[{ label: 'GPU', value: '' }]} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('never renders a copy toolbar', () => {
    render(<SystemSpecsPanel variant="tiles" rows={rows} copyLabel="Copy" copiedLabel="Copied!" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

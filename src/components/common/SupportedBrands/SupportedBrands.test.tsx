import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { SUPPORTED_BRANDS, SupportedBrands } from './SupportedBrands';

describe('SupportedBrands', () => {
  it('renders one labelled button per brand and reports the clicked brand', () => {
    const onSelect = vi.fn();
    render(<SupportedBrands onSelect={onSelect} />);

    expect(screen.getAllByRole('button')).toHaveLength(SUPPORTED_BRANDS.length);
    fireEvent.click(screen.getByRole('button', { name: 'Cooler Master' }));
    expect(onSelect).toHaveBeenCalledWith('Cooler Master');
  });

  it('shows a mark where one exists and the name otherwise', () => {
    render(<SupportedBrands />);

    expect(screen.getByRole('button', { name: 'ASUS' }).querySelector('svg')).not.toBeNull();
    const hyte = screen.getByRole('button', { name: 'HYTE' });
    expect(hyte.querySelector('svg')).toBeNull();
    expect(hyte).toHaveTextContent('HYTE');
  });

  it('renders to static HTML with data-brand for host pages to wire', () => {
    const html = renderToString(<SupportedBrands />);
    expect(html).toContain('data-brand="Lian Li"');
  });
});

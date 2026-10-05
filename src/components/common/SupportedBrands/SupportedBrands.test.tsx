import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { SupportedBrands } from './SupportedBrands';
import { BRAND_LOGOS } from './brandLogos';

describe('SupportedBrands', () => {
  it('renders one labelled button per brand and reports the clicked brand', () => {
    const onSelect = vi.fn();
    render(<SupportedBrands onSelect={onSelect} />);

    expect(screen.getAllByRole('button')).toHaveLength(BRAND_LOGOS.length);
    fireEvent.click(screen.getByRole('button', { name: 'Cooler Master' }));
    expect(onSelect).toHaveBeenCalledWith('Cooler Master');
  });

  it('draws every brand as a mark with at least one path', () => {
    render(<SupportedBrands />);

    for (const button of screen.getAllByRole('button')) {
      expect(button.querySelectorAll('svg path').length).toBeGreaterThan(0);
    }
  });

  it('renders to static HTML with data-brand for host pages to wire', () => {
    const html = renderToString(<SupportedBrands />);
    expect(html).toContain('data-brand="Lian Li"');
  });
});

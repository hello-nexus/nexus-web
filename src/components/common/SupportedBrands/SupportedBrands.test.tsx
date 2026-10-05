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

  it('ends the grid with the "and many more" text, not another button', () => {
    const { container } = render(<SupportedBrands />);

    const last = container.firstElementChild!.lastElementChild!;
    expect(last.tagName).toBe('SPAN');
    expect(last.textContent).toBe('supported.moreBrands');
  });

  it('highlights only the brand the query leads with', () => {
    render(<SupportedBrands query="  cooler master ml240 " />);

    expect(screen.getByRole('button', { name: 'Cooler Master' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getAllByRole('button').filter(b => b.hasAttribute('aria-current'))).toHaveLength(1);
  });

  it('does not highlight a partial or later brand name', () => {
    render(<SupportedBrands query="kraken nzxt" />);
    expect(screen.getAllByRole('button').filter(b => b.hasAttribute('aria-current'))).toHaveLength(0);
  });

  it('renders to static HTML with data-brand for host pages to wire', () => {
    const html = renderToString(<SupportedBrands />);
    expect(html).toContain('data-brand="Lian Li"');
  });
});

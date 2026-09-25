import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let text = key;
      if (params) for (const [k, v] of Object.entries(params)) text += ` ${k}=${v}`;
      return text;
    },
  }),
}));

import { Pager } from './Pager';

describe('Pager', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(<Pager page={0} pageCount={1} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the one-based page label and disables Previous on the first page', () => {
    const onPageChange = vi.fn();
    render(<Pager page={0} pageCount={3} onPageChange={onPageChange} />);
    expect(screen.getByText('common.pager.pageOf n=1 total=3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.pager.prev' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'common.pager.next' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('disables Next on the last page', () => {
    const onPageChange = vi.fn();
    render(<Pager page={2} pageCount={3} onPageChange={onPageChange} />);
    expect(screen.getByRole('button', { name: 'common.pager.next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'common.pager.prev' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('moves focus to the opposite button when a click reaches either end', () => {
    function TwoPages() {
      const [page, setPage] = useState(0);
      return <Pager page={page} pageCount={2} onPageChange={setPage} />;
    }
    render(<TwoPages />);
    const prev = screen.getByRole('button', { name: 'common.pager.prev' });
    const next = screen.getByRole('button', { name: 'common.pager.next' });
    fireEvent.click(next);
    expect(prev).toHaveFocus();
    fireEvent.click(prev);
    expect(next).toHaveFocus();
  });
});

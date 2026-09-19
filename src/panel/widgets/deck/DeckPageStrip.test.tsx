import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DeckPageStrip } from './DeckPageStrip';

// The default (no-provider) t() ignores interpolation params entirely, which
// would hide a regression in how removeCount reaches the confirm text - mock
// it the same interpolation-aware way DeckInstanceEditor.test.tsx does.
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

describe('DeckPageStrip', () => {
  it('renders one tab per page and switches on click', () => {
    const onSelectPage = vi.fn();
    render(
      <DeckPageStrip
        pageCount={3}
        currentPage={0}
        onSelectPage={onSelectPage}
        onAddPage={vi.fn()}
        onRemoveCurrentPage={vi.fn()}
        currentPageHasContent={false}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    fireEvent.click(tabs[2]);
    expect(onSelectPage).toHaveBeenCalledWith(2);
  });

  it('calls onAddPage when the add control is pressed', () => {
    const onAddPage = vi.fn();
    render(
      <DeckPageStrip
        pageCount={1}
        currentPage={0}
        onSelectPage={vi.fn()}
        onAddPage={onAddPage}
        onRemoveCurrentPage={vi.fn()}
        currentPageHasContent={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.page.add' }));
    expect(onAddPage).toHaveBeenCalledTimes(1);
  });

  it('disables the remove control when the deck has only one page', () => {
    render(
      <DeckPageStrip
        pageCount={1}
        currentPage={0}
        onSelectPage={vi.fn()}
        onAddPage={vi.fn()}
        onRemoveCurrentPage={vi.fn()}
        currentPageHasContent={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'panel.settings.deck.page.remove' })).toBeDisabled();
  });

  it('removes the current page immediately when it has no content', () => {
    const onRemove = vi.fn();
    render(
      <DeckPageStrip
        pageCount={2}
        currentPage={0}
        onSelectPage={vi.fn()}
        onAddPage={vi.fn()}
        onRemoveCurrentPage={onRemove}
        currentPageHasContent={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.page.remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('confirms before removing a page that has content', () => {
    const onRemove = vi.fn();
    render(
      <DeckPageStrip
        pageCount={2}
        currentPage={0}
        onSelectPage={vi.fn()}
        onAddPage={vi.fn()}
        onRemoveCurrentPage={onRemove}
        currentPageHasContent
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.page.remove' }));
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('confirm.ok'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('numbered mode renders plain page-number chips instead of "Page N" tabs', () => {
    const onSelectPage = vi.fn();
    render(
      <DeckPageStrip
        numbered
        pageCount={3}
        currentPage={0}
        onSelectPage={onSelectPage}
        onAddPage={vi.fn()}
        onRemoveCurrentPage={vi.fn()}
        currentPageHasContent={false}
      />,
    );
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByText('panel.settings.deck.page.tab')).toBeNull();

    const chips = screen.getAllByText(/^[123]$/);
    expect(chips).toHaveLength(3);
    fireEvent.click(chips[2]);
    expect(onSelectPage).toHaveBeenCalledWith(2);

    // The add/remove controls are unchanged in numbered mode.
    expect(screen.getByRole('button', { name: 'panel.settings.deck.page.add' })).toBeInTheDocument();
  });

  it('readOnly hides the add/remove controls entirely, page switching still works', () => {
    const onSelectPage = vi.fn();
    render(
      <DeckPageStrip
        numbered
        readOnly
        pageCount={2}
        currentPage={0}
        onSelectPage={onSelectPage}
      />,
    );
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.page.add' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'panel.settings.deck.page.remove' })).toBeNull();

    fireEvent.click(screen.getByText('2'));
    expect(onSelectPage).toHaveBeenCalledWith(1);
  });

  it('names the authored page\'s key count in the remove confirm text', () => {
    render(
      <DeckPageStrip
        pageCount={2}
        currentPage={0}
        onSelectPage={vi.fn()}
        onAddPage={vi.fn()}
        onRemoveCurrentPage={vi.fn()}
        currentPageHasContent
        removeCount={12}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.page.remove' }));
    expect(screen.getByText('panel.settings.deck.page.removeConfirmBody:{"count":12}')).toBeInTheDocument();
  });

  it('defaults the remove confirm count to 0 when removeCount is omitted', () => {
    render(
      <DeckPageStrip
        pageCount={2}
        currentPage={0}
        onSelectPage={vi.fn()}
        onAddPage={vi.fn()}
        onRemoveCurrentPage={vi.fn()}
        currentPageHasContent
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.page.remove' }));
    expect(screen.getByText('panel.settings.deck.page.removeConfirmBody:{"count":0}')).toBeInTheDocument();
  });

  it('cancelling the confirm leaves the page untouched', () => {
    const onRemove = vi.fn();
    render(
      <DeckPageStrip
        pageCount={2}
        currentPage={0}
        onSelectPage={vi.fn()}
        onAddPage={vi.fn()}
        onRemoveCurrentPage={onRemove}
        currentPageHasContent
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.page.remove' }));
    fireEvent.click(screen.getByText('confirm.cancel'));
    expect(onRemove).not.toHaveBeenCalled();
  });
});

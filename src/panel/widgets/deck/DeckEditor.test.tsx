import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DeckEditor } from './DeckEditor';
import type { DeckTarget } from './deckTarget';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

vi.mock('./DeckKeyInspector', () => ({
  DeckKeyInspector: ({ page }: { page: number }) => <div data-testid="inspector-page">{page}</div>,
  DeckDefaultTitleSettings: () => null,
  DeckActionDragPreview: () => null,
  slotForPickerKind: () => ({}),
}));

function fakeTarget(pageCount: number, authoredPageCount = pageCount): DeckTarget {
  return {
    kind: 'widget',
    cols: 2,
    rows: 2,
    keyCount: 4,
    config: { pages: Array.from({ length: pageCount }, () => ({ slots: [] })) },
    updateSlot: vi.fn(),
    swapSlots: vi.fn(),
    addPage: vi.fn(),
    removePage: vi.fn().mockReturnValue(0),
    removePageKeyCount: vi.fn().mockReturnValue(0),
    setTitleDefault: vi.fn(),
    authoredPageCount,
  };
}

describe('DeckEditor - page clamp', () => {
  it('clamps an out-of-range page prop to the fitted config\'s last page (a preset switch can land on a page the new config no longer has)', () => {
    const target = fakeTarget(2);
    render(
      <DeckEditor
        target={target}
        page={5}
        onPageChange={vi.fn()}
        folderPath={[]}
        onFolderPathChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('inspector-page')).toHaveTextContent('1');
  });

  it('renders the page prop unchanged when it is already in range', () => {
    const target = fakeTarget(3);
    render(
      <DeckEditor
        target={target}
        page={1}
        onPageChange={vi.fn()}
        folderPath={[]}
        onFolderPathChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('inspector-page')).toHaveTextContent('1');
  });

  it('clamps to page 0 for a single-page config', () => {
    const target = fakeTarget(1);
    render(
      <DeckEditor
        target={target}
        page={4}
        onPageChange={vi.fn()}
        folderPath={[]}
        onFolderPathChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('inspector-page')).toHaveTextContent('0');
  });
});

describe('DeckEditor - page-remove control keys off the AUTHORED page count', () => {
  it('disables Remove when a single authored page spans several fitted (chunked) pages', () => {
    const target = fakeTarget(2, 1);
    render(
      <DeckEditor
        target={target}
        page={0}
        onPageChange={vi.fn()}
        folderPath={[]}
        onFolderPathChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'panel.settings.deck.page.remove' })).toBeDisabled();
  });

  it('enables Remove when there is more than one authored page', () => {
    const target = fakeTarget(2, 2);
    render(
      <DeckEditor
        target={target}
        page={0}
        onPageChange={vi.fn()}
        folderPath={[]}
        onFolderPathChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'panel.settings.deck.page.remove' })).not.toBeDisabled();
  });

  it('onRemoveCurrentPage selects the fitted page target.removePage returns, not page - 1', () => {
    const onPageChange = vi.fn();
    const target = fakeTarget(3, 2);
    (target.removePage as ReturnType<typeof vi.fn>).mockReturnValue(1);
    render(
      <DeckEditor
        target={target}
        page={2}
        onPageChange={onPageChange}
        folderPath={[]}
        onFolderPathChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'panel.settings.deck.page.remove' }));
    expect(target.removePage).toHaveBeenCalledWith(2);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });
});

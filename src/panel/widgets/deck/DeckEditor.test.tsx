import { render, screen } from '@testing-library/react';
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

function fakeTarget(pageCount: number): DeckTarget {
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

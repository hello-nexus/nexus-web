import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Keep the list deterministic: two page-apps (one delisted-safe) plus one
// page-less widget, which must not be offered as a sidebar entry.
vi.mock('../panel/widgets/registry', () => ({
  getCatalogEntries: () => [
    ['cooling', { Page: () => null, meta: { i18nKey: 'app.cooling' } }],
    ['lighting', { Page: () => null, meta: { i18nKey: 'app.lighting' } }],
    ['clock', { Page: undefined, meta: { i18nKey: 'app.clock' } }],
  ],
}));

vi.mock('./sidebarApps', () => ({
  getSidebarAppMeta: (key: string) => ({ icon: null, i18nKey: `app.${key}` }),
}));

import { AddSidebarAppSlideout } from './AddSidebarAppSlideout';

function open(props: Partial<Parameters<typeof AddSidebarAppSlideout>[0]> = {}) {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  render(
    <AddSidebarAppSlideout
      open
      onClose={onClose}
      pinnedKeys={['cooling']}
      onAdd={onAdd}
      {...props}
    />,
  );
  return { onAdd, onClose };
}

describe('AddSidebarAppSlideout', () => {
  it('lists only apps that have a page', () => {
    open();
    expect(screen.getByRole('button', { name: 'app.lighting' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'app.clock' })).not.toBeInTheDocument();
  });

  // aria-disabled, not the native attribute: the rows must stay tabbable so a
  // keyboard user doesn't read the list as missing the apps they already have.
  it('marks apps already pinned to the sidebar as disabled without removing them from the tab order', () => {
    const { onAdd } = open();
    const pinned = screen.getByRole('button', { name: 'app.cooling' });
    expect(pinned).toHaveAttribute('aria-disabled', 'true');
    expect(pinned).not.toHaveAttribute('disabled');
    expect(pinned).toHaveAttribute('title', 'sidebar.addApp.added');
    fireEvent.click(pinned);
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'app.lighting' })).not.toHaveAttribute('aria-disabled');
  });

  it('adds the clicked app and closes', () => {
    const { onAdd, onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: 'app.lighting' }));
    expect(onAdd).toHaveBeenCalledWith('lighting');
    expect(onClose).toHaveBeenCalled();
  });

  // The accent + used to sit before the title. Asserted off the title element
  // itself rather than Slideout's header internals, so adding chrome elsewhere
  // in that header is not this suite's business.
  it('renders no icon beside the title', () => {
    open();
    const title = screen.getByText('sidebar.addApp');
    expect(title.parentElement?.querySelector('svg')).toBeNull();
  });

  it('filters the list by the search query', () => {
    open();
    fireEvent.change(screen.getByPlaceholderText('sidebar.addApp.search'), { target: { value: 'cool' } });
    expect(screen.getByRole('button', { name: 'app.cooling' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'app.lighting' })).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', () => {
    open();
    fireEvent.change(screen.getByPlaceholderText('sidebar.addApp.search'), { target: { value: 'zzz' } });
    expect(screen.getByText('sidebar.addApp.empty')).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    render(<AddSidebarAppSlideout open={false} onClose={vi.fn()} pinnedKeys={[]} onAdd={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'app.lighting' })).not.toBeInTheDocument();
  });
});

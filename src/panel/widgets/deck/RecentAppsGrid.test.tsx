import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RecentAppsGrid } from './RecentAppsGrid';
import type { RecentAppsViewPage } from './recentAppsView';
import styles from './DeckGrid.module.scss';

vi.mock('../common/AppPicker', () => ({ useAppIcon: (id?: string) => (id === 'has-icon' ? 'blob:mock-shortcut-icon' : null) }));
vi.mock('../../../hooks/useProcessIcon', () => ({ useProcessIcon: (name?: string) => (name === 'chrome' ? 'blob:mock-process-icon' : null) }));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function appKey(over: Record<string, unknown> = {}) {
  return { kind: 'app', processKey: 'discord', name: 'Discord', focused: false, ...over };
}

describe('RecentAppsGrid - app cells', () => {
  it('names the key after the app, with no visible label', () => {
    const pages: RecentAppsViewPage[] = [[appKey()]];
    render(<RecentAppsGrid pages={pages} cols={1} rows={1} onPress={vi.fn()} />);
    const key = screen.getByRole('button', { name: 'Discord' });
    expect(key).toBeInTheDocument();
    // No caption under the icon - at most the initial-letter glyph fallback.
    expect(screen.queryByText('Discord')).toBeNull();
  });

  it('renders a shortcut icon when shortcutId resolves, as the full key face on a transparent accent', () => {
    const pages: RecentAppsViewPage[] = [[appKey({ shortcutId: 'has-icon' })]];
    const { container } = render(<RecentAppsGrid pages={pages} cols={1} rows={1} onPress={vi.fn()} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'blob:mock-shortcut-icon');
    expect(img?.className).toBe(styles.appIconFull);
    expect(screen.getByRole('button', { name: 'Discord' }).style.getPropertyValue('--deck-accent')).toBe('transparent');
  });

  it('falls back to the process icon when there is no shortcutId', () => {
    const pages: RecentAppsViewPage[] = [[appKey({ processKey: 'chrome', name: 'Chrome' })]];
    const { container } = render(<RecentAppsGrid pages={pages} cols={1} rows={1} onPress={vi.fn()} />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:mock-process-icon');
  });

  it('falls back to an initial-letter glyph on the accent fill when neither icon resolves', () => {
    const pages: RecentAppsViewPage[] = [[appKey({ processKey: 'unknownapp', name: 'Unknown App' })]];
    const { container } = render(<RecentAppsGrid pages={pages} cols={1} rows={1} onPress={vi.fn()} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('U')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unknown App' }).style.getPropertyValue('--deck-accent')).not.toBe('transparent');
  });

  it('the focused key gets the selected treatment and a press is a no-op', () => {
    const onPress = vi.fn();
    const pages: RecentAppsViewPage[] = [[appKey({ focused: true })]];
    render(<RecentAppsGrid pages={pages} cols={1} rows={1} onPress={onPress} />);
    const cell = screen.getByRole('button', { name: 'Discord' });
    expect(cell).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(cell);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('pressing an unfocused app key calls onPress with its processKey', () => {
    const onPress = vi.fn();
    const pages: RecentAppsViewPage[] = [[appKey({ processKey: 'discord' })]];
    render(<RecentAppsGrid pages={pages} cols={1} rows={1} onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discord' }));
    expect(onPress).toHaveBeenCalledWith('discord');
  });

  it('an app cell\'s element identity survives a reorder (keyed by processKey, not array index)', () => {
    const before: RecentAppsViewPage[] = [[
      appKey({ processKey: 'a', name: 'App A' }),
      appKey({ processKey: 'b', name: 'App B' }),
    ]];
    const { rerender } = render(<RecentAppsGrid pages={before} cols={2} rows={1} onPress={vi.fn()} />);
    const nodeA = screen.getByRole('button', { name: 'App A' });

    // The ring reorders on every focus change - same apps, new positions.
    const after: RecentAppsViewPage[] = [[
      appKey({ processKey: 'b', name: 'App B' }),
      appKey({ processKey: 'a', name: 'App A' }),
    ]];
    rerender(<RecentAppsGrid pages={after} cols={2} rows={1} onPress={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'App A' })).toBe(nodeA);
  });
});

describe('RecentAppsGrid - blank keys', () => {
  it('renders a blank cell with no button', () => {
    const pages: RecentAppsViewPage[] = [[{ kind: 'blank' }]];
    const { container } = render(<RecentAppsGrid pages={pages} cols={1} rows={1} onPress={vi.fn()} />);
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('RecentAppsGrid - pagination', () => {
  it('navNext moves to the next page in place, navPrev moves back', () => {
    const pages: RecentAppsViewPage[] = [
      [appKey({ processKey: 'a', name: 'App A' }), { kind: 'navNext' }],
      [{ kind: 'navPrev' }, appKey({ processKey: 'b', name: 'App B' })],
    ];
    render(<RecentAppsGrid pages={pages} cols={2} rows={1} onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'App A' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('panel.settings.deck.recentApps.nextPage'));
    expect(screen.getByRole('button', { name: 'App B' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'App A' })).toBeNull();

    fireEvent.click(screen.getByLabelText('panel.settings.deck.recentApps.prevPage'));
    expect(screen.getByRole('button', { name: 'App A' })).toBeInTheDocument();
  });

  it('clamps the current page down when the ring shrinks to fewer pages', () => {
    const twoPages: RecentAppsViewPage[] = [
      [appKey({ processKey: 'a', name: 'App A' }), { kind: 'navNext' }],
      [{ kind: 'navPrev' }, appKey({ processKey: 'b', name: 'App B' })],
    ];
    const { rerender } = render(<RecentAppsGrid pages={twoPages} cols={2} rows={1} onPress={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('panel.settings.deck.recentApps.nextPage'));
    expect(screen.getByRole('button', { name: 'App B' })).toBeInTheDocument();

    const onePage: RecentAppsViewPage[] = [[appKey({ processKey: 'a', name: 'App A' }), { kind: 'blank' }]];
    rerender(<RecentAppsGrid pages={onePage} cols={2} rows={1} onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'App A' })).toBeInTheDocument();
  });
});

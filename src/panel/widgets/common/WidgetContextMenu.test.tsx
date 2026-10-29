// A right-click on another widget while a menu is up fires an outside
// pointerdown (which starts this menu's close timer) and then a
// contextmenu that PanelApp turns into a keyed remount. The remount must
// leave the new menu open: the old instance's timer dies with it.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TopologyDisplay } from '../../../api/displays';
import { displayTargetsOf } from '../../engine/useDisplayTargets';
import { WidgetContextMenu } from './WidgetContextMenu';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string, params?: { name?: string; n?: string }) => (key === 'displays.numberedName' ? `${params?.name} (${params?.n})` : params?.name ? `${key} ${params.name}` : key) }),
}));

function menu(key: number, onClose: () => void) {
  return (
    <WidgetContextMenu
      key={key}
      x={100}
      y={100}
      currentSize="2x2"
      sizes={['2x2']}
      hasConfig={false}
      surface="desktop"
      onResize={vi.fn()}
      onEdit={vi.fn()}
      onRemove={vi.fn()}
      onClose={onClose}
    />
  );
}

describe('WidgetContextMenu', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('closes after an outside pointerdown', () => {
    const onClose = vi.fn();
    render(menu(1, onClose));
    act(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a keyed remount after the outside pointerdown stays open', () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const { rerender } = render(menu(1, firstClose));
    act(() => { document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    rerender(menu(2, secondClose));
    act(() => { vi.advanceTimersByTime(200); });
    expect(firstClose).not.toHaveBeenCalled();
    expect(secondClose).not.toHaveBeenCalled();
  });
});

describe('WidgetContextMenu name row', () => {
  const base = { x: 0, y: 0, currentSize: '2x2' as const, sizes: ['2x2' as const], hasConfig: false, title: 'Clock', onResize: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() };

  it('is the Open action when the widget can open, with an arrow and no separate Open item', () => {
    const onOpen = vi.fn();
    const { container } = render(<WidgetContextMenu {...base} onOpen={onOpen} />);
    const row = screen.getByRole('button', { name: 'featureDisabled.widget.open' });
    expect(row.textContent).toBe('Clock');
    expect(row.querySelector('svg')).not.toBeNull();
    expect(screen.queryByText('search.kind.open')).toBeNull();
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(container.firstElementChild!.children[1].className).toContain('divider');
  });

  it('renders no separate Immersive mode item', () => {
    render(<WidgetContextMenu {...base} onImmersive={vi.fn()} />);
    expect(screen.queryByText('panel.widget.menu.immersive')).toBeNull();
  });

  it('runs the immersive handler from the name row when immersive is available', () => {
    const onImmersive = vi.fn();
    render(<WidgetContextMenu {...base} onImmersive={onImmersive} />);
    fireEvent.click(screen.getByRole('button', { name: 'panel.widget.menu.immersive' }));
    expect(onImmersive).toHaveBeenCalledTimes(1);
  });

  it('keeps a plain Open item beside the immersive name row', () => {
    const onImmersive = vi.fn();
    const onOpen = vi.fn();
    render(<WidgetContextMenu {...base} onImmersive={onImmersive} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('openInApp.open'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onImmersive).not.toHaveBeenCalled();
  });

  it('is an inert label without an arrow when there is nothing to open', () => {
    const { container } = render(<WidgetContextMenu {...base} />);
    const label = screen.getByText('Clock');
    const row = label.parentElement!;
    expect(row.getAttribute('role')).toBe('presentation');
    expect(row.hasAttribute('tabindex')).toBe(false);
    expect(row.closest('button')).toBeNull();
    expect(row.querySelector('svg')).toBeNull();
    const focusable = Array.from(document.querySelectorAll('button, [tabindex]'));
    expect(focusable.every(el => !el.contains(label))).toBe(true);
    expect(container.firstElementChild!.children[1].className).toContain('divider');
  });

  it('renders no row or separator without a title', () => {
    render(menu(1, vi.fn()));
    expect(document.querySelector('[role="presentation"]')).toBeNull();
  });
});

// A panel scales the menu up; it scales about --menu-origin, so the layout box
// must sit where the painted (scaled) box ends up clamped inside the viewport.
describe('WidgetContextMenu on a scaled panel', () => {
  const descriptors = {
    rect: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect'),
    ow: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
    oh: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
  };
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 100 });
    HTMLElement.prototype.getBoundingClientRect = () => ({ width: 600, height: 300, x: 0, y: 0, top: 0, left: 0, right: 600, bottom: 300, toJSON: () => ({}) }) as DOMRect;
    vi.stubGlobal('innerWidth', 720);
    vi.stubGlobal('innerHeight', 1280);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (descriptors.ow) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', descriptors.ow);
    if (descriptors.oh) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', descriptors.oh);
    if (descriptors.rect) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', descriptors.rect);
  });

  it('keeps a right-edge click on screen instead of throwing the menu left', () => {
    const { container } = render(
      <WidgetContextMenu x={700} y={100} currentSize="2x2" sizes={['2x2']} hasConfig={false} surface="q60"
        onResize={vi.fn()} onEdit={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />,
    );
    const el = [...container.ownerDocument.querySelectorAll<HTMLElement>('[style]')].find(n => n.style.getPropertyValue('--menu-origin-x'))!;
    const left = parseFloat(el.style.left);
    const origin = parseFloat(el.style.getPropertyValue('--menu-origin-x'));
    // Painted left edge = layout left + origin * (1 - scale).
    const paintedLeft = left + origin * (1 - 3);
    expect(paintedLeft).toBeCloseTo(720 - 600 - 8);
    expect(origin).toBeLessThanOrEqual(200);
  });

  it('offers Resize on the dashboard menu and starts the mode when chosen', () => {
    const onResizeMode = vi.fn();
    render(
      <WidgetContextMenu x={100} y={100} currentSize="2x2" sizes={['2x2', '4x2']} hasConfig surface="desktop"
        onResize={vi.fn()} onResizeMode={onResizeMode} onEdit={vi.fn()} onRemove={vi.fn()} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('panel.widget.menu.resize'));
    expect(onResizeMode).toHaveBeenCalledTimes(1);
  });

  it('omits Resize when the caller offers no mode', () => {
    render(menu(1, vi.fn()));
    expect(screen.queryByText('panel.widget.menu.resize')).toBeNull();
  });
});

describe('WidgetContextMenu lock widgets', () => {
  const base = { x: 100, y: 100, currentSize: '2x2' as const, sizes: ['2x2' as const], hasConfig: true, surface: 'monitor' as const, onResize: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() };

  it('offers one panel-wide item that toggles and hides edit while locked', () => {
    const onToggleLock = vi.fn();
    const { rerender } = render(<WidgetContextMenu {...base} locked={false} onToggleLock={onToggleLock} />);
    expect(screen.queryByText('panel.widget.menu.unlock')).toBeNull();
    expect(screen.queryByText('panel.widget.menu.lockAll')).toBeNull();
    expect(screen.getByText('panel.widget.menu.edit')).toBeTruthy();
    fireEvent.click(screen.getByText('panel.widget.menu.lockWidgets'));
    expect(onToggleLock).toHaveBeenCalled();
    rerender(<WidgetContextMenu {...base} locked onToggleLock={onToggleLock} />);
    expect(screen.queryByText('panel.widget.menu.edit')).toBeNull();
    expect(screen.getByText('panel.widget.menu.lockWidgets')).toBeTruthy();
  });

  it('keeps the immersive name row reachable while locked', () => {
    render(<WidgetContextMenu {...base} title="Clock" locked onToggleLock={vi.fn()} onImmersive={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'panel.widget.menu.immersive' })).toBeTruthy();
  });

  it('shows no lock item where lock is not offered', () => {
    render(<WidgetContextMenu {...base} />);
    expect(screen.queryByText('panel.widget.menu.lockWidgets')).toBeNull();
  });
});

describe('WidgetContextMenu always on top', () => {
  const base = { x: 100, y: 100, currentSize: '2x2' as const, sizes: ['2x2' as const], hasConfig: true, surface: 'monitor' as const, onResize: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() };

  it('toggles when allowed', () => {
    const onToggle = vi.fn();
    render(<WidgetContextMenu {...base} alwaysOnTop onToggleAlwaysOnTop={onToggle} />);
    const item = screen.getByRole('button', { name: 'panel.widget.menu.alwaysOnTop' });
    expect(item).not.toBeDisabled();
    fireEvent.click(item);
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows a disabled, unchecked item when the background does not allow it', () => {
    const onToggle = vi.fn();
    render(<WidgetContextMenu {...base} alwaysOnTop={false} alwaysOnTopDisabled onToggleAlwaysOnTop={onToggle} />);
    const item = screen.getByRole('button', { name: 'panel.widget.menu.alwaysOnTop' });
    expect(item).toBeDisabled();
    fireEvent.click(item);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('WidgetContextMenu order', () => {
  const props = { x: 100, y: 100, currentSize: '2x2' as const, sizes: ['2x2' as const, '4x2' as const], hasConfig: true, surface: 'desktop' as const, onResize: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onClose: vi.fn(), onResizeMode: vi.fn() };
  const sequence = (container: HTMLElement) =>
    Array.from(container.firstElementChild!.children).map(c => (c.className.includes('divider') ? '|' : c.className.includes('sizeRow') ? 'chips' : (c.textContent ?? '')));

  it('orders chips, widget items, toggles, then panel items with single dividers', () => {
    const { container } = render(<WidgetContextMenu {...props} onToggleLock={vi.fn()} onToggleAlwaysOnTop={vi.fn()} onAddWidget={vi.fn()} onOpenPanelActions={vi.fn()} />);
    expect(sequence(container)).toEqual([
      'chips', '|', 'panel.widget.menu.edit', 'panel.widget.menu.resize', 'panel.widget.menu.remove',
      '|', 'panel.widget.menu.lockWidgets', 'panel.widget.menu.alwaysOnTop',
      '|', 'panel.widget.menu.addWidget', 'panel.actions.label',
    ]);
  });

  it('drops empty groups without stray dividers', () => {
    const { container } = render(<WidgetContextMenu {...props} sizes={['2x2']} onAddWidget={vi.fn()} />);
    expect(sequence(container)).toEqual(['panel.widget.menu.edit', 'panel.widget.menu.resize', 'panel.widget.menu.remove', '|', 'panel.widget.menu.addWidget']);
    const bare = render(<WidgetContextMenu {...props} sizes={['2x2']} />);
    expect(sequence(bare.container)).toEqual(['panel.widget.menu.edit', 'panel.widget.menu.resize', 'panel.widget.menu.remove']);
  });

  it('puts Edit, Resize and Remove last on the dashboard, one divider above them', () => {
    const targets = [{ id: 'd1', name: 'Desk', number: '1' }];
    const { container } = render(<WidgetContextMenu {...props} widgetItemsLast displayTargets={targets} onAddToDisplay={vi.fn()} onUnpinFromSidebar={vi.fn()} />);
    expect(sequence(container)).toEqual([
      'chips', '|', 'panel.widget.menu.addToDisplay', 'sidebar.unpin',
      '|', 'panel.widget.menu.edit', 'panel.widget.menu.resize', 'panel.widget.menu.remove',
    ]);
    const empty = render(<WidgetContextMenu {...props} widgetItemsLast />);
    expect(sequence(empty.container)).toEqual(['chips', '|', 'panel.widget.menu.edit', 'panel.widget.menu.resize', 'panel.widget.menu.remove']);
    const bare = render(<WidgetContextMenu {...props} sizes={['2x2']} widgetItemsLast />);
    expect(sequence(bare.container)).toEqual(['panel.widget.menu.edit', 'panel.widget.menu.resize', 'panel.widget.menu.remove']);
  });
});

describe('WidgetContextMenu add to display', () => {
  const base = { x: 100, y: 100, currentSize: '2x2' as const, sizes: ['2x2' as const], hasConfig: true, surface: 'desktop' as const, onResize: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() };

  it('lists the window display first on a host with several unpromoted displays and adds to the chosen one', () => {
    const onAdd = vi.fn();
    const targets = displayTargetsOf(
      {
        hostingSupported: true, rotationSupported: true, reserveSupported: true, positionsAvailable: true, revision: 1, hint: '',
        displays: [
          { id: 'main', name: 'Main', assignedPanelDeviceId: null, hostingSupported: true, isY70: false },
          { id: 'side', name: 'Side', assignedPanelDeviceId: null, hostingSupported: true, isY70: false },
        ] as unknown as TopologyDisplay[],
      },
      [],
      'side',
    );
    render(<WidgetContextMenu {...base} displayTargets={targets} onAddToDisplay={onAdd} />);
    const items = screen.getAllByText(/panel.widget.menu.addToDisplayNamed/);
    expect(items).toHaveLength(2);
    fireEvent.click(items[0]);
    expect(onAdd).toHaveBeenCalledWith('side');
  });

  it('numbers several entries and leaves a single entry plain', () => {
    const two = [{ id: 'a', name: 'DEL A0B8', number: '1' }, { id: 'b', name: 'DEL A0B8', number: '2' }];
    const { unmount } = render(<WidgetContextMenu {...base} displayTargets={two} onAddToDisplay={vi.fn()} />);
    expect(screen.getByText(/DEL A0B8 \(1\)/)).toBeTruthy();
    expect(screen.getByText(/DEL A0B8 \(2\)/)).toBeTruthy();
    unmount();
    render(<WidgetContextMenu {...base} displayTargets={[two[0]]} onAddToDisplay={vi.fn()} />);
    expect(screen.getByText('panel.widget.menu.addToDisplay')).toBeTruthy();
    expect(screen.queryByText(/DEL A0B8/)).toBeNull();
  });

  it('shows no item without a handler', () => {
    render(<WidgetContextMenu {...base} displayTargets={[{ id: 'a', name: 'A' }]} />);
    expect(screen.queryByText(/addToDisplay/)).toBeNull();
  });
});

describe('WidgetContextMenu web view navigation', () => {
  const base = { x: 100, y: 100, currentSize: '2x2' as const, sizes: ['2x2' as const, '4x2' as const], hasConfig: true, surface: 'y70' as const, onResize: vi.fn(), onEdit: vi.fn(), onRemove: vi.fn(), onClose: vi.fn() };
  const labels = () => Array.from(document.querySelectorAll('button')).map(b => b.textContent);

  it('shows no group and no extra separator when nothing applies', () => {
    const { container } = render(<WidgetContextMenu {...base} />);
    expect(screen.queryByText('panel.widget.web-view.back')).toBeNull();
    expect(screen.queryByText('panel.widget.web-view.forward')).toBeNull();
    expect(screen.queryByText('panel.widget.web-view.home')).toBeNull();
    const first = container.querySelector('[data-panel-hit]')!.firstElementChild!;
    expect(first.className).not.toContain('divider');
  });

  it('puts Back, Forward, Home first, then a separator before the sizes', () => {
    const { container } = render(<WidgetContextMenu {...base} onWebBack={vi.fn()} onWebForward={vi.fn()} onWebHome={vi.fn()} />);
    const order = labels();
    expect(order.slice(0, 3)).toEqual(['panel.widget.web-view.back', 'panel.widget.web-view.forward', 'panel.widget.web-view.home']);
    const kids = Array.from(container.querySelector('[data-panel-hit]')!.children);
    expect(kids[3].className).toContain('divider');
    expect(kids[4].className).toContain('sizeRow');
  });

  it('shows only the items offered and runs them', () => {
    const onWebForward = vi.fn();
    render(<WidgetContextMenu {...base} onWebForward={onWebForward} />);
    expect(screen.queryByText('panel.widget.web-view.back')).toBeNull();
    fireEvent.click(screen.getByText('panel.widget.web-view.forward'));
    expect(onWebForward).toHaveBeenCalled();
  });
});

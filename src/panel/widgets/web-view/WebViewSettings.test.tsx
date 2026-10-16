import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PanelWidget } from '../../types';
import { WebViewSettings } from './WebViewSettings';

const widget = { id: 'w1', type: 'web-view', size: '4x4', config: { url: 'https://example.com/' } } as PanelWidget;
const base = { widget, onUpdate: vi.fn(), onResize: vi.fn() };

describe('WebViewSettings URL field', () => {
  it('is an editable input on a surface with a keyboard', () => {
    render(<WebViewSettings {...base} surface="phone" />);
    expect(screen.getByDisplayValue('https://example.com/')).toBeTruthy();
    expect(screen.queryByText('common.desktopOnly')).toBeNull();
  });

  it('is plain text with the desktop-only badge on a touch panel', () => {
    render(<WebViewSettings {...base} surface="y70" />);
    expect(screen.queryByDisplayValue('https://example.com/')).toBeNull();
    expect(screen.getByText('https://example.com/')).toBeTruthy();
    expect(screen.getByText('common.desktopOnly')).toBeTruthy();
  });

  it('stays editable on a touch panel edited from the desktop', () => {
    render(<WebViewSettings {...base} surface="y70" desktopEditor />);
    expect(screen.getByDisplayValue('https://example.com/')).toBeTruthy();
  });
});

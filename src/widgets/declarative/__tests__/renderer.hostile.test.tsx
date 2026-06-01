import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderView } from '../renderer';
import type { WidgetView } from '../../types';

// Partner-supplied widget JSON reaches renderView untrusted; it must degrade,
// never throw, and never pollute globals.
const ctx = {
  data: { temp: { value: 42, formatted: '42°C', name: 'CPU' } },
  settings: {},
  size: { width: 200, height: 200 },
  widgetId: 'com.hellonexus.test',
};

describe('declarative renderer — hostile / malformed input', () => {
  it('returns null for a missing or non-object view without throwing', () => {
    expect(renderView(undefined, ctx)).toBeNull();
    expect(renderView(null as unknown as WidgetView, ctx)).toBeNull();
    expect(renderView('text' as unknown as WidgetView, ctx)).toBeNull();
    expect(renderView(42 as unknown as WidgetView, ctx)).toBeNull();
  });

  it('renders a diagnostic for a view with no type', () => {
    const { container } = render(<>{renderView({} as WidgetView, ctx)}</>);
    expect(container.textContent).toContain('missing meter type');
  });

  it('does not throw or pollute Object.prototype on a __proto__ binding', () => {
    const view = { type: 'text', text: 'x {__proto__.polluted} y' } as unknown as WidgetView;
    const { container } = render(<>{renderView(view, ctx)}</>);
    expect(container.textContent).toContain('x');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('renders an unknown meter type as a diagnostic, never undefined/blank', () => {
    const out = renderView({ type: 'definitely-not-a-meter' } as WidgetView, ctx);
    expect(out).not.toBeUndefined();
    const { container } = render(<>{out}</>);
    expect(container.textContent).toContain('unknown meter');
  });
});

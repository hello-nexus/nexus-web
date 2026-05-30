import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderView } from '../renderer';
import type { WidgetView } from '../../types';

const ctx = {
  data: { temp: { value: 42, formatted: '42°C', name: 'CPU Package' } },
  settings: { color: '#ff8800', warnTemp: 80, criticalTemp: 95 },
  size: { width: 200, height: 200 },
  widgetId: 'com.hellonexus.test',
};

describe('declarative renderer', () => {
  it('renders a plain text meter', () => {
    const { getByText } = render(<>{renderView({ type: 'text', text: 'Hello {data.temp.formatted}' } as WidgetView, ctx)}</>);
    expect(getByText('Hello 42°C')).toBeTruthy();
  });

  it('renders a value meter with unit', () => {
    const { container } = render(<>{renderView({ type: 'value', text: '{round(data.temp.value)}', unit: '°' } as WidgetView, ctx)}</>);
    expect(container.textContent).toContain('42');
    expect(container.textContent).toContain('°');
  });

  it('renders nested vstack with children', () => {
    const view: WidgetView = {
      type: 'vstack',
      children: [
        { type: 'text', text: 'CPU' },
        { type: 'value', text: '{data.temp.value}' },
      ],
    };
    const { container } = render(<>{renderView(view, ctx)}</>);
    expect(container.textContent).toContain('CPU');
    expect(container.textContent).toContain('42');
  });

  it('renders unknown meter types as a visible diagnostic', () => {
    const { container } = render(<>{renderView({ type: 'bogus' } as WidgetView, ctx)}</>);
    expect(container.textContent).toContain('unknown meter');
  });

  it('conditional shows the `then` branch when truthy', () => {
    const view: WidgetView = {
      type: 'conditional',
      when: '{data.temp.value > 10}',
      then: { type: 'text', text: 'hot' },
      else: { type: 'text', text: 'cold' },
    };
    const { container } = render(<>{renderView(view, ctx)}</>);
    expect(container.textContent).toContain('hot');
    expect(container.textContent).not.toContain('cold');
  });

  it('ring renders an svg', () => {
    const view: WidgetView = { type: 'ring', value: '{data.temp.value}', min: 0, max: 100, color: 'accent' };
    const { container } = render(<>{renderView(view, ctx)}</>);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('threshold escalates colour as value crosses limit', () => {
    const view: WidgetView = {
      type: 'bar',
      value: '{data.temp.value}',
      min: 0, max: 100,
      thresholds: [{ above: 40, color: 'bad' }],
    };
    const { container } = render(<>{renderView(view, ctx)}</>);
    // The bar's filled child carries the resolved colour as inline style.
    const filled = container.querySelectorAll('div')[1];
    expect(filled).toBeTruthy();
    expect(filled?.getAttribute('style') ?? '').toContain('var(--bad');
  });

  it('repeat renders the template per item with {data.item.*} bindings', () => {
    const ctxWithList = {
      ...ctx,
      data: {
        ...ctx.data,
        hourly: [
          { hourLabel: '3PM', tempLabel: '72°' },
          { hourLabel: '4PM', tempLabel: '74°' },
          { hourLabel: '5PM', tempLabel: '73°' },
        ],
      },
    };
    const view: WidgetView = {
      type: 'repeat',
      in: '{data.hourly}',
      direction: 'horizontal',
      template: {
        type: 'vstack',
        children: [
          { type: 'text', text: '{data.item.hourLabel}' },
          { type: 'text', text: '{data.item.tempLabel}' },
        ],
      },
    };
    const { container } = render(<>{renderView(view, ctxWithList)}</>);
    expect(container.textContent).toContain('3PM');
    expect(container.textContent).toContain('72°');
    expect(container.textContent).toContain('5PM');
  });

  it('repeat falls back to `empty` when the array is missing or zero-length', () => {
    const view: WidgetView = {
      type: 'repeat',
      in: '{data.missing}',
      template: { type: 'text', text: 'should not appear' },
      empty: { type: 'text', text: 'no data' },
    };
    const { container } = render(<>{renderView(view, ctx)}</>);
    expect(container.textContent).toContain('no data');
    expect(container.textContent).not.toContain('should not appear');
  });

  it('repeat honours `limit` to slice the array', () => {
    const ctxWithList = {
      ...ctx,
      data: { ...ctx.data, xs: [1, 2, 3, 4, 5].map((n) => ({ n })) },
    };
    const view: WidgetView = {
      type: 'repeat',
      in: '{data.xs}',
      limit: 2,
      template: { type: 'text', text: '{data.item.n}' },
    };
    const { container } = render(<>{renderView(view, ctxWithList)}</>);
    expect(container.textContent).toBe('12');
  });

  it('range meter places the fill between lo and hi within [min, max]', () => {
    const view: WidgetView = {
      type: 'range', lo: 60, hi: 80, min: 50, max: 100, color: 'accent',
    };
    const { container } = render(<>{renderView(view, ctx)}</>);
    const fill = container.querySelectorAll('div')[1];
    expect(fill).toBeTruthy();
    const style = fill?.getAttribute('style') ?? '';
    // range=[50,100], width=50. lo=60 → 20% from left.
    // hi=80 → 40% from right → fill width = (80-60)/50 = 40%.
    expect(style).toMatch(/left:\s*20%/);
    expect(style).toMatch(/width:\s*40%/);
  });

  it('weatherIcon binding resolves WMO codes', () => {
    const view: WidgetView = {
      type: 'icon', name: "{weatherIcon(data.code)}", size: 16, color: 'accent',
    };
    const sunCtx = { ...ctx, data: { ...ctx.data, code: 1 } };
    const rainCtx = { ...ctx, data: { ...ctx.data, code: 63 } };
    const { container: sun } = render(<>{renderView(view, sunCtx)}</>);
    const { container: rain } = render(<>{renderView(view, rainCtx)}</>);
    expect(sun.querySelector('svg')).toBeTruthy();
    expect(rain.querySelector('svg')).toBeTruthy();
    // Different icons render different SVG content; cheapest check is path count.
    expect(sun.innerHTML).not.toBe(rain.innerHTML);
  });
});

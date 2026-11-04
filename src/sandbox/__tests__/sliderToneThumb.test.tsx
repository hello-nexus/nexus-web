// `ui-slider` tone and thumbIcon: the fill takes the tone, the icon replaces the knob, and a toned
// slider is not dimmed while disabled. Unknown icon names render nothing and never throw.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../../api/auth', () => ({ getToken: async () => 'tok', getTokenSync: () => 'tok' }));
vi.mock('../../api/service', () => ({ postService: vi.fn(async () => ({ error: false })) }));

import { Slider, Icon, Button } from '../ui/components';
import { ICON_TABLE } from '../ui/icons';

afterEach(() => cleanup());

const range = (props: Record<string, unknown>) =>
  render(<Slider value={40} min={0} max={100} orientation="bare" disabled {...props} />).container.querySelector('input[type="range"]') as HTMLInputElement;

describe('ui-slider tone and thumbIcon', () => {
  it('colors the fill from the tone', () => {
    expect(range({ tone: 'good', trackFill: true }).style.getPropertyValue('--slider-fill-color')).toContain('--good');
  });

  it('keeps the accent fill and the knob when neither prop is set', () => {
    const el = range({ trackFill: true });
    expect(el.style.getPropertyValue('--slider-fill-color')).toBe('');
    expect(el.hasAttribute('data-toned')).toBe(false);
    expect(el.hasAttribute('data-custom-thumb')).toBe(false);
  });

  it('draws the icon on the track and hides the native knob', () => {
    const { container } = render(<Slider value={50} min={0} max={100} orientation="bare" disabled tone="warn" thumbIcon="clock" />);
    const el = container.querySelector('input[type="range"]') as HTMLInputElement;
    expect(el.hasAttribute('data-custom-thumb')).toBe(true);
    expect(el.hasAttribute('data-toned')).toBe(true);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('places the icon at the value along the knob travel', () => {
    const { container } = render(<Slider value={25} min={0} max={100} orientation="bare" thumbIcon="check" />);
    const node = container.querySelector('svg')!.parentElement as HTMLElement;
    expect(node.style.left).toContain('0.25');
  });

  it('gives the knob the fill color so it paints solid in the tone', () => {
    const { container } = render(<Slider value={50} min={0} max={100} orientation="bare" tone="bad" thumbIcon="x" />);
    const node = container.querySelector('svg')!.parentElement as HTMLElement;
    expect(node.style.getPropertyValue('--slider-fill-color')).toContain('--bad');
  });

  it('leaves the slider untouched for an unknown tone', () => {
    const el = range({ tone: 'typo', trackFill: true });
    expect(el.style.getPropertyValue('--slider-fill-color')).toBe('');
    expect(el.hasAttribute('data-toned')).toBe(false);
  });

  it('pairs the knob glyph with an ink per tone', () => {
    const ink = (tone: string) => {
      const { container } = render(<Slider value={50} min={0} max={100} orientation="bare" tone={tone} thumbIcon="check" />);
      return (container.querySelector('svg')!.parentElement as HTMLElement).style.getPropertyValue('--slider-thumb-ink');
    };
    expect(ink('accent')).toContain('--accent-text');
    expect(ink('text')).toContain('--bg');
    expect(ink('warn')).toContain('--bg');
    expect(ink('good')).toBe('#fff');
    expect(ink('bad')).toBe('#fff');
  });

  it('ignores an unknown thumb icon without throwing', () => {
    const { container } = render(<Slider value={50} min={0} max={100} orientation="bare" thumbIcon="no-such-icon" />);
    expect(container.querySelector('input[type="range"]')?.hasAttribute('data-custom-thumb')).toBe(false);
  });
});

describe('ui-slider marks', () => {
  const marks = [
    { value: 0, label: 'Start', detail: 'Oct 1' },
    { value: 100, label: 'End', detail: 'Oct 9', tone: 'good' },
    { value: 50, label: 'Today', detail: '5', side: 'above', large: true },
    { label: 'no value' },
  ];
  it('draws marks under and over the track and skips malformed ones', () => {
    const { container } = render(<Slider value={50} min={0} max={100} orientation="bare" marks={marks} />);
    const text = container.textContent ?? '';
    for (const t of ['Start', 'Oct 1', 'End', 'Oct 9', 'Today']) expect(text).toContain(t);
    expect(text).not.toContain('no value');
  });
  it('colors a mark from its tone and points only below-track marks', () => {
    const { container } = render(<Slider value={50} min={0} max={100} orientation="bare" marks={marks} />);
    const end = Array.from(container.querySelectorAll('div')).find((d) => d.textContent === 'EndOct 9') as HTMLElement;
    expect(end.style.color).toContain('--good');
    expect(end.querySelector('svg')).not.toBeNull();
    const today = Array.from(container.querySelectorAll('div')).find((d) => d.textContent === 'Today5') as HTMLElement;
    expect(today.querySelector('svg')).toBeNull();
  });
  it('ignores marks that are not an array', () => {
    const { container } = render(<Slider value={50} min={0} max={100} orientation="bare" marks={'nope' as unknown as never} />);
    expect(container.querySelector('input[type="range"]')).not.toBeNull();
  });
});

describe('icon table', () => {
  it('has package-open', () => {
    expect(ICON_TABLE['package-open']).toBeDefined();
  });

  it('renders nothing for an unknown icon name and for a button with one', () => {
    expect(render(<Icon name="no-such-icon" />).container.innerHTML).toBe('');
    cleanup();
    const btn = render(<Button label="Go" icon="no-such-icon" />).container.querySelector('button');
    expect(btn?.querySelector('svg')).toBeNull();
    expect(btn?.textContent).toBe('Go');
  });
});

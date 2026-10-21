import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hasGaugeReading } from '../../../__tests__/panel/visibleText';
import { MicroBar } from './MicroBar';

describe('MicroBar designs', () => {
  it('backdrop design renders a filled history Sparkline; bar and fill do not', () => {
    const history = Array.from({ length: 30 }, (_, i) => i * 2);
    const graph = render(
      <MicroBar label="GPU" formatted="88%" fillPercent={88} design="backdrop" history={history} historyDomain={[0, 100]} />,
    );
    expect(graph.container.querySelector('svg')).not.toBeNull();

    const bars = render(<MicroBar label="CPU" formatted="72" fillPercent={60} design="bar" />);
    expect(bars.container.querySelector('svg')).toBeNull();

    const fill = render(<MicroBar label="MEM" formatted="41%" fillPercent={41} design="fill" />);
    expect(fill.container.querySelector('svg')).toBeNull();
  });

  it('renders the caption label and value, hiding the label span when empty', () => {
    const labeled = render(<MicroBar label="CPU" formatted="72" fillPercent={60} design="bar" />);
    expect(within(labeled.container).getByText('CPU')).toBeInTheDocument();
    expect(hasGaugeReading(labeled.container, '72')).toBe(true);

    const unlabeled = render(<MicroBar label="" formatted="72" fillPercent={60} design="bar" />);
    expect(within(unlabeled.container).queryByText('CPU')).toBeNull();
    expect(hasGaugeReading(unlabeled.container, '72')).toBe(true);
  });

  it('simple design renders label and value with no track, fill, or graph', () => {
    const { container } = render(<MicroBar label="CPU" formatted="40 °C" fillPercent={40} design="simple" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(within(container).getByText('CPU')).toBeInTheDocument();
    expect(hasGaugeReading(container, '40 °C')).toBe(true);
    expect(container.querySelector('[class*="track" i]')).toBeNull();
    expect(container.querySelector('[class*="fillBar"]')).toBeNull();
  });

  it('simple design applies the alignment class, defaulting to left', () => {
    const left = render(<MicroBar label="CPU" formatted="40" fillPercent={40} design="simple" />);
    expect(left.container.firstElementChild?.firstElementChild?.className).toMatch(/align_left/);
    const right = render(<MicroBar label="CPU" formatted="40" fillPercent={40} design="simple" align="right" />);
    expect(right.container.firstElementChild?.firstElementChild?.className).toMatch(/align_right/);
    const center = render(<MicroBar label="CPU" formatted="40" fillPercent={40} design="simple" align="center" />);
    expect(center.container.firstElementChild?.firstElementChild?.className).toMatch(/align_center/);
  });

  it('simple design omits the label span when empty', () => {
    const { container } = render(<MicroBar label="" formatted="40" fillPercent={40} design="simple" />);
    expect(container.querySelector('[class*="simpleLabel"]')).toBeNull();
    expect(hasGaugeReading(container, '40')).toBe(true);
  });

  it('defaults to the bar design when none is given', () => {
    const { container } = render(<MicroBar label="CPU" formatted="50%" fillPercent={50} />);
    expect(container.querySelector('svg')).toBeNull();
  });
});
